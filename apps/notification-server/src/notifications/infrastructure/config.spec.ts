import KafkaJS from 'kafkajs';
import './config.js';

const { CompressionCodecs, CompressionTypes } = KafkaJS;

describe('Kafka compression', () => {
  it('decodes Snappy-compressed messages after loading the Kafka configuration', async () => {
    const codec = CompressionCodecs[CompressionTypes.Snappy]();
    const compressed = Buffer.from([5, 16, 104, 101, 108, 108, 111]);

    expect(await codec.decompress(compressed)).toEqual(Buffer.from('hello'));
  });
});
