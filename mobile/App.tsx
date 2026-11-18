import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api').replace(/\/$/, '');

export default function App() {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [message, setMessage] = useState('Checking the Laravel API…');

  const checkApi = useCallback(async () => {
    setStatus('loading');
    setMessage('Checking the Laravel API…');

    try {
      const response = await fetch(`${apiBaseUrl}/health`);

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const result: { message: string } = await response.json();
      setStatus('connected');
      setMessage(result.message);
    } catch {
      setStatus('disconnected');
      setMessage('Could not reach Laravel. Check the API URL and make sure the server is running.');
    }
  }, []);

  useEffect(() => {
    void checkApi();
  }, [checkApi]);

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>EXPO GO + LARAVEL</Text>
      <Text style={styles.title}>Communication Bridge</Text>
      <View style={styles.card}>
        {status === 'loading' ? (
          <ActivityIndicator color="#2563eb" />
        ) : (
          <View style={[styles.indicator, status === 'connected' ? styles.connected : styles.disconnected]} />
        )}
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>
            {status === 'loading' ? 'Connecting' : status === 'connected' ? 'API connected' : 'API unavailable'}
          </Text>
          <Text style={styles.message}>{message}</Text>
        </View>
      </View>
      <Text style={styles.urlLabel}>API URL</Text>
      <Text style={styles.url}>{apiBaseUrl}</Text>
      <Pressable style={styles.button} onPress={() => void checkApi()}>
        <Text style={styles.buttonText}>Check connection</Text>
      </Pressable>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    padding: 24,
  },
  eyebrow: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 28,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    padding: 20,
  },
  indicator: {
    borderRadius: 8,
    height: 16,
    width: 16,
  },
  connected: {
    backgroundColor: '#16a34a',
  },
  disconnected: {
    backgroundColor: '#dc2626',
  },
  statusCopy: {
    flex: 1,
    gap: 5,
  },
  statusTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
  urlLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 28,
    textTransform: 'uppercase',
  },
  url: {
    color: '#334155',
    fontSize: 14,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 10,
    marginTop: 24,
    padding: 14,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
