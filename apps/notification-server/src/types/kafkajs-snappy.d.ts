declare module 'kafkajs-snappy' {
  export default function SnappyCodec(): {
    compress(encoder: { buffer: Buffer }): Promise<Buffer>;
    decompress(buffer: Buffer): Promise<Buffer>;
  };
}
