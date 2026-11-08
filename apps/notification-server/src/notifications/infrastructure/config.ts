import KafkaJS, { type KafkaConfig } from 'kafkajs';
import SnappyCodec from 'kafkajs-snappy';

const { CompressionCodecs, CompressionTypes } = KafkaJS;
CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;

export function required(name: string): string {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function kafkaConfig(): KafkaConfig {
  const brokers = required('KAFKA_BOOTSTRAP_SERVERS')
    .split(',')
    .map((value) => value.trim());

  if (brokers.some((broker) => !broker))
    throw new Error('KAFKA_BOOTSTRAP_SERVERS must not contain empty values');

  const config: KafkaConfig = {
    clientId: 'notification-server',
    brokers,
    connectionTimeout: 10000,
    requestTimeout: 10000,
    retry: {
      retries: 2,
      restartOnFailure: async () => false,
    },
  };

  if (process.env.KAFKA_ALLOW_LOCAL_PLAINTEXT === 'true') {
    if (!['development', 'test'].includes(process.env.APP_ENV ?? '')) {
      throw new Error('Plaintext Kafka is development-only');
    }
    return config;
  }

  const mechanism = (
    process.env.KAFKA_SASL_MECHANISM ?? 'SCRAM-SHA-512'
  ).toLowerCase();

  if (mechanism !== 'scram-sha-512' && mechanism !== 'scram-sha-256') {
    throw new Error(`Unsupported SASL mechanism: ${mechanism}`);
  }

  const credentials = {
    username: required('KAFKA_USERNAME'),
    password: required('KAFKA_PASSWORD'),
  };

  if (mechanism === 'scram-sha-256') {
    return { ...config, ssl: true, sasl: { mechanism, ...credentials } };
  }

  return { ...config, ssl: true, sasl: { mechanism, ...credentials } };
}
