package ca.htn2026.pocketgait

import android.app.Activity
import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** UI for the foreground recorder. Recording intentionally survives screen lock and Activity pause. */
class MainActivity : Activity() {
    private lateinit var sensorManager: SensorManager
    private lateinit var labelInput: EditText
    private lateinit var startStopButton: Button
    private lateinit var status: TextView
    private lateinit var sensorStatus: TextView
    private var pendingLabel: String? = null

    private val recordingReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) = refreshRecordingState()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        setContentView(buildUi())
        showSensorAvailability()
        registerRecordingReceiver()
    }

    override fun onResume() {
        super.onResume()
        refreshRecordingState()
    }

    override fun onDestroy() {
        unregisterReceiver(recordingReceiver)
        super.onDestroy()
    }

    private fun buildUi(): View {
        val padding = (20 * resources.displayMetrics.density).toInt()
        val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(padding, padding, padding, padding) }
        content.addView(TextView(this).apply { text = "Pocket Gait Collector"; textSize = 27f; setTextColor(Color.rgb(11, 87, 208)) })
        content.addView(TextView(this).apply {
            text = "Start a labeled 20–30 second trial, lock the screen, then reopen this app to stop and save it."
            textSize = 16f; setPadding(0, padding / 2, 0, padding / 2)
        })
        labelInput = EditText(this).apply { hint = "Trial label (e.g. normal, faster, left_altered)"; setText("normal"); isSingleLine = true }
        content.addView(labelInput)
        startStopButton = Button(this).apply { setOnClickListener { toggleRecording() } }
        content.addView(startStopButton)
        status = TextView(this).apply { textSize = 16f; setPadding(0, padding / 2, 0, 0) }
        sensorStatus = TextView(this).apply { textSize = 14f; setPadding(0, padding / 2, 0, 0) }
        content.addView(status); content.addView(sensorStatus)
        return ScrollView(this).apply { addView(content) }
    }

    private fun toggleRecording() {
        if (isRecording()) {
            startService(Intent(this, GaitRecordingService::class.java).setAction(GaitRecordingService.ACTION_STOP))
        } else {
            pendingLabel = labelInput.text.toString()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED
            ) {
                status.text = "Allow Physical activity permission to keep recording with the screen locked."
                requestPermissions(arrayOf(Manifest.permission.ACTIVITY_RECOGNITION), REQUEST_ACTIVITY_RECOGNITION)
            } else {
                startRecording(pendingLabel.orEmpty())
            }
        }
    }

    private fun startRecording(label: String) {
        val intent = Intent(this, GaitRecordingService::class.java)
            .setAction(GaitRecordingService.ACTION_START)
            .putExtra(GaitRecordingService.EXTRA_LABEL, label)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent) else startService(intent)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_ACTIVITY_RECOGNITION) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
                startRecording(pendingLabel.orEmpty())
            } else {
                status.text = "Physical activity permission is required for screen-off recording."
            }
        }
    }

    private fun isRecording() = getSharedPreferences(GaitRecordingService.PREFS, Context.MODE_PRIVATE)
        .getBoolean(GaitRecordingService.KEY_RECORDING, false)

    private fun refreshRecordingState() {
        val prefs = getSharedPreferences(GaitRecordingService.PREFS, Context.MODE_PRIVATE)
        val recording = prefs.getBoolean(GaitRecordingService.KEY_RECORDING, false)
        labelInput.isEnabled = !recording
        startStopButton.text = if (recording) "Stop and save" else "Start recording"
        status.text = prefs.getString(GaitRecordingService.KEY_MESSAGE, null)
            ?: "Ready. Locking the screen during recording is supported."
    }

    private fun showSensorAvailability() {
        val required = listOf("Accelerometer" to Sensor.TYPE_ACCELEROMETER, "Gyroscope" to Sensor.TYPE_GYROSCOPE, "Gravity" to Sensor.TYPE_GRAVITY, "Rotation vector" to Sensor.TYPE_ROTATION_VECTOR)
        sensorStatus.text = required.joinToString("\n") { (name, type) -> "$name: ${sensorManager.getDefaultSensor(type)?.name ?: "unavailable"}" }
    }

    private fun registerRecordingReceiver() {
        val filter = IntentFilter(GaitRecordingService.ACTION_STATE_CHANGED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) registerReceiver(recordingReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        else registerReceiver(recordingReceiver, filter)
    }

    companion object {
        private const val REQUEST_ACTIVITY_RECOGNITION = 2026
    }
}
