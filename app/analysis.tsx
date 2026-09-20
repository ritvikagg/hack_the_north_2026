import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../src/theme';
import { cancelGaitCapture, GaitCapture, shareGaitCsv, startGaitCapture, stopGaitCapture } from '../src/lib/gait';

export default function Analysis() {
  const [tracking, setTracking] = useState(false);
  const [capture, setCapture] = useState<GaitCapture | null>(null);
  const [message, setMessage] = useState('Place the phone in a pocket and walk normally for at least 8 seconds.');

  useEffect(() => () => cancelGaitCapture(), []);

  const toggleCapture = useCallback(async () => {
    if (tracking) {
      try {
        const completed = stopGaitCapture(null);
        setCapture(completed);
        setMessage(completed.analysis.reason);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not stop the capture.');
      } finally {
        setTracking(false);
      }
      return;
    }

    try {
      await startGaitCapture('walking_analysis');
      setCapture(null);
      setTracking(true);
      setMessage('Recording raw motion at a target 50 Hz...');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start the capture.');
    }
  }, [tracking]);

  const exportCsv = useCallback(async () => {
    if (!capture) return;
    try {
      const uri = await shareGaitCsv(capture);
      setMessage(`CSV saved: ${uri}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not export the CSV.');
    }
  }, [capture]);

  const analysis = capture?.analysis;
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={[typography.h2, { color: colors.textPrimary }]}>Walking analysis</Text>
      <Text style={[typography.body, styles.copy]}>
        This is a movement-quality signal, not a diagnosis. It captures accelerometer, gyroscope, gravity-derived, and orientation channels for analysis or CSV export.
      </Text>

      <Pressable onPress={toggleCapture} style={[styles.button, { backgroundColor: tracking ? colors.danger : colors.purple }]}>
        <Text style={[typography.h3, { color: colors.textPrimary }]}>{tracking ? 'Stop and analyze' : 'Start walking analysis'}</Text>
      </Pressable>
      <Text style={[typography.caption, styles.message]}>{message}</Text>

      {analysis && (
        <View style={styles.card}>
          <Text style={[typography.h3, { color: analysis.isVerified ? colors.success : colors.danger }]}>
            {analysis.isVerified ? 'Consistent walking signal' : 'Insufficient / inconsistent signal'}
          </Text>
          <Metric label="Cadence" value={`${analysis.cadenceSpm.toFixed(0)} steps/min`} />
          <Metric label="Periodicity" value={`${Math.round(analysis.periodicity * 100)}%`} />
          <Metric label="Signal rate" value={`${analysis.sampleRateHz.toFixed(1)} Hz`} />
          <Metric label="Samples" value={String(analysis.sampleCount)} />
          <Metric label="Confidence" value={`${Math.round(analysis.confidence * 100)}%`} />
          <Text style={[typography.caption, styles.reason]}>{analysis.reason}</Text>
          <Pressable onPress={exportCsv} style={styles.exportButton}>
            <Text style={[typography.body, { color: colors.pink }]}>Share raw CSV</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={[typography.body, { color: colors.textSecondary }]}>{label}</Text><Text style={[typography.body, { color: colors.textPrimary }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: colors.background, padding: spacing.lg, gap: spacing.md },
  copy: { color: colors.textSecondary, lineHeight: 22 },
  button: { alignItems: 'center', borderRadius: radius.pill, marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  message: { color: colors.textSecondary, lineHeight: 18 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  metric: { flexDirection: 'row', justifyContent: 'space-between' },
  reason: { color: colors.textSecondary, lineHeight: 18, marginTop: spacing.sm },
  exportButton: { alignItems: 'center', borderColor: colors.pink, borderRadius: radius.pill, borderWidth: 1, marginTop: spacing.sm, padding: spacing.sm },
});
