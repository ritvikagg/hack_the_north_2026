package ca.htn2026.pocketgait

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.IBinder
import android.os.PowerManager
import java.io.BufferedWriter
import java.io.File
import java.io.FileWriter
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Owns sensor collection rather than the Activity, so the session continues when
 * the display is locked or the Activity is paused. A foreground notification makes
 * collection visible to the user, and the short-lived partial wake lock preserves
 * the requested sensor rate during an active walking trial.
 */
class GaitRecordingService : Service(), SensorEventListener {
    private lateinit var sensorManager: SensorManager
    private var writer: BufferedWriter? = null
    private var currentFile: File? = null
    private var label = "unlabeled"
    private var sampleCount = 0L
    private var wakeLock: PowerManager.WakeLock? = null

    private var gx: Float? = null; private var gy: Float? = null; private var gz: Float? = null
    private var gravX: Float? = null; private var gravY: Float? = null; private var gravZ: Float? = null
    private var qx: Float? = null; private var qy: Float? = null; private var qz: Float? = null; private var qw: Float? = null

    override fun onCreate() {
        super.onCreate()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> if (writer == null) startRecording(intent.getStringExtra(EXTRA_LABEL).orEmpty())
            ACTION_STOP -> stopRecording()
        }
        // A failed service must never be resurrected: that could create empty files.
        return START_NOT_STICKY
    }

    private fun startRecording(requestedLabel: String) {
        label = requestedLabel.ifBlank { "unlabeled" }
            .replace(Regex("[^A-Za-z0-9_-]"), "_")
            .take(48)
        try {
            // Establish foreground status first. If Android rejects it, no CSV is created.
            startForeground(NOTIFICATION_ID, notification())
            acquireWakeLock()
            val directory = File(getExternalFilesDir(android.os.Environment.DIRECTORY_DOCUMENTS), "gait_sessions")
            check(directory.exists() || directory.mkdirs()) { "Could not create app data directory." }
            val time = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss", Locale.US)
                .withZone(ZoneOffset.UTC).format(Instant.now())
            currentFile = File(directory, "gait_${time}_${label}.csv")
            writer = BufferedWriter(FileWriter(currentFile!!)).also {
                it.write("session_id,label,t_ns,wall_time_utc,accel_x_mps2,accel_y_mps2,accel_z_mps2,gyro_x_rads,gyro_y_rads,gyro_z_rads,gravity_x_mps2,gravity_y_mps2,gravity_z_mps2,rotation_qx,rotation_qy,rotation_qz,rotation_qw\n")
            }
            sampleCount = 0
            register(Sensor.TYPE_ACCELEROMETER)
            register(Sensor.TYPE_GYROSCOPE)
            register(Sensor.TYPE_GRAVITY)
            register(Sensor.TYPE_ROTATION_VECTOR)
            publishState(true, "Recording: $label (0 samples)")
        } catch (error: Exception) {
            sensorManager.unregisterListener(this)
            writer?.close()
            writer = null
            currentFile?.takeIf { it.length() == 0L }?.delete()
            currentFile = null
            releaseWakeLock()
            stopForeground(STOP_FOREGROUND_REMOVE)
            publishState(false, "Could not start recording: ${error.message ?: "permission error"}")
            stopSelf()
        }
    }

    private fun stopRecording() {
        sensorManager.unregisterListener(this)
        writer?.flush()
        writer?.close()
        val savedPath = currentFile?.absolutePath ?: "unknown path"
        writer = null
        currentFile = null
        releaseWakeLock()
        stopForeground(STOP_FOREGROUND_REMOVE)
        publishState(false, "Saved $sampleCount samples: $savedPath")
        stopSelf()
    }

    private fun register(sensorType: Int) {
        sensorManager.getDefaultSensor(sensorType)?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_ACCELEROMETER -> writeAccelRow(event.timestamp, event.values)
            Sensor.TYPE_GYROSCOPE -> { gx = event.values.getOrNull(0); gy = event.values.getOrNull(1); gz = event.values.getOrNull(2) }
            Sensor.TYPE_GRAVITY -> { gravX = event.values.getOrNull(0); gravY = event.values.getOrNull(1); gravZ = event.values.getOrNull(2) }
            Sensor.TYPE_ROTATION_VECTOR -> {
                qx = event.values.getOrNull(0); qy = event.values.getOrNull(1); qz = event.values.getOrNull(2)
                qw = event.values.getOrNull(3) ?: run {
                    val sum = (qx!! * qx!!) + (qy!! * qy!!) + (qz!! * qz!!)
                    kotlin.math.sqrt((1f - sum).coerceAtLeast(0f))
                }
            }
        }
    }

    @Synchronized
    private fun writeAccelRow(timestampNs: Long, values: FloatArray) {
        val csv = writer ?: return
        val row = listOf(
            currentFile!!.nameWithoutExtension, label, timestampNs.toString(), Instant.now().toString(),
            values.getOrNull(0).csv(), values.getOrNull(1).csv(), values.getOrNull(2).csv(),
            gx.csv(), gy.csv(), gz.csv(), gravX.csv(), gravY.csv(), gravZ.csv(), qx.csv(), qy.csv(), qz.csv(), qw.csv()
        ).joinToString(",")
        csv.write(row)
        csv.newLine()
        sampleCount++
        if (sampleCount % 20L == 0L) publishState(true, "Recording: $label ($sampleCount samples)")
    }

    private fun Float?.csv(): String = this?.let { String.format(Locale.US, "%.7f", it) } ?: ""
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun acquireWakeLock() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:gait-recording").apply { acquire() }
    }

    private fun releaseWakeLock() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
    }

    private fun notification() = android.app.Notification.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_media_play)
        .setContentTitle("Pocket Gait Collector is recording")
        .setContentText("Lock the screen if you like. Reopen the app to stop and save.")
        .setOngoing(true)
        .setContentIntent(PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        .build()

    private fun createNotificationChannel() {
        val channel = NotificationChannel(CHANNEL_ID, "Gait recording", NotificationManager.IMPORTANCE_LOW)
        channel.description = "Visible while a gait session is being recorded"
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun publishState(recording: Boolean, message: String) {
        getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_RECORDING, recording).putString(KEY_MESSAGE, message).apply()
        sendBroadcast(Intent(ACTION_STATE_CHANGED).setPackage(packageName))
    }

    override fun onDestroy() {
        if (writer != null) stopRecording() else releaseWakeLock()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_START = "ca.htn2026.pocketgait.START"
        const val ACTION_STOP = "ca.htn2026.pocketgait.STOP"
        const val ACTION_STATE_CHANGED = "ca.htn2026.pocketgait.STATE_CHANGED"
        const val EXTRA_LABEL = "label"
        const val PREFS = "gait_recording_state"
        const val KEY_RECORDING = "recording"
        const val KEY_MESSAGE = "message"
        private const val CHANNEL_ID = "gait_recording"
        private const val NOTIFICATION_ID = 2026
    }
}
