import json
import sys
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from gait_scoring import score_session
from service.gait_scoring_api import GaitScoringHandler


class ScoringIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), GaitScoringHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def request(self, method, route, body=None):
        connection = HTTPConnection(*self.server.server_address, timeout=10)
        connection.request(method, route, body=body, headers={'Content-Type': 'text/csv'})
        response = connection.getresponse()
        result = (response.status, json.loads(response.read()))
        connection.close()
        return result

    def test_health_and_real_native_csv(self):
        self.assertEqual(self.request('GET', '/health')[0], 200)
        sample = next((ROOT / 'data/raw/gait_sessions').glob('*.csv'))
        status, score = self.request('POST', '/score', sample.read_bytes())
        self.assertEqual(status, 200)
        self.assertGreaterEqual(score['genuine_probability'], 0)
        self.assertLessEqual(score['genuine_probability'], 1)
        self.assertGreater(score['feature_values']['duration_s'], 8)

    def test_old_expo_schema_and_empty_payload_fail_clearly(self):
        self.assertEqual(self.request('POST', '/score', b't_ms,accel_x_mps2\n0,1')[0], 400)
        self.assertEqual(self.request('POST', '/score', b'')[0], 400)

    def test_expo_compatible_relative_nanosecond_timestamps(self):
        rows = ['t_ns,accel_x_mps2,accel_y_mps2,accel_z_mps2,gyro_x_rads,gyro_y_rads,gyro_z_rads']
        import math
        for i in range(1000):
            rows.append(f'{i * 20_000_000},0,0,{9.81 + math.sin(i / 4)},0.2,0.3,0.1')
        status, result = self.request('POST', '/score', '\n'.join(rows).encode())
        self.assertEqual(status, 200)
        self.assertAlmostEqual(result['feature_values']['duration_s'], 19.98)
        self.assertAlmostEqual(result['feature_values']['sample_rate_hz'], 50)

    def test_all_collected_sessions_remain_scoreable(self):
        for sample in (ROOT / 'data/raw/gait_sessions').glob('*.csv'):
            with self.subTest(sample=sample.name):
                self.assertIn(score_session(sample)['decision'], ('genuine', 'altered_gait'))


if __name__ == '__main__':
    unittest.main()
