import { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { AppText, Button, ErrorNotice, PageHeader, Screen, Surface } from '../../components/ui';
import { parseGroupInvitePayload } from '../../services/groupInvite';
import { useDemo } from '../../state/DemoProvider';
import { colors, errorMessage } from '../../theme';

export default function ScanGroupInvite() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanLocked = useRef(false);
  const { dispatch, busy } = useDemo();

  async function handleScan({ data }: BarcodeScanningResult) {
    if (scanLocked.current || busy) return;
    scanLocked.current = true;
    setScanned(true);
    setError(null);

    const code = parseGroupInvitePayload(data);
    if (!code) {
      setError('That is not a valid Pledgefit group QR code.');
      return;
    }

    try {
      const id = await dispatch({ type: 'joinGroup', code });
      router.replace({ pathname: '/group/[id]', params: { id: id! } });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  if (!permission) {
    return <Screen scroll={false}><PageHeader back title="Scan a group invite." eyebrow="Groups" /><ActivityIndicator color={colors.forest} accessibilityLabel="Checking camera permission" /></Screen>;
  }

  if (!permission.granted) {
    return <Screen scroll={false}>
      <PageHeader back title="Scan a group invite." eyebrow="Groups" />
      <Surface style={{ gap: 16, alignItems: 'center' }}>
        <AppText style={{ textAlign: 'center' }}>Pledgefit needs camera access to scan your friend’s group QR code.</AppText>
        <Button label="Allow camera access" onPress={() => void requestPermission()} />
      </Surface>
    </Screen>;
  }

  return <Screen scroll={false}>
    <PageHeader back title="Scan a group invite." eyebrow="Groups" subtitle="Point your camera at a Pledgefit group QR code." />
    <View style={{ flex: 1, minHeight: 320, overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: colors.line }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : (result) => void handleScan(result)}
      />
      <View pointerEvents="none" style={{ position: 'absolute', inset: 42, borderWidth: 3, borderColor: colors.lime, borderRadius: 24 }} />
    </View>
    <ErrorNotice message={error} />
    {scanned && error && <Button label="Scan again" variant="secondary" onPress={() => { scanLocked.current = false; setError(null); setScanned(false); }} />}
    {busy && <AppText color={colors.muted} style={{ textAlign: 'center', marginTop: 12 }}>Joining group…</AppText>}
  </Screen>;
}
