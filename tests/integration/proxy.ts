import net from 'node:net';

/** A TCP proxy in front of the test server, so a test can cut the bot's connection. */
export class TcpProxy {
  private readonly server: net.Server;
  private readonly sockets = new Set<net.Socket>();
  port = 0;

  constructor(private readonly target: { host: string; port: number }) {
    this.server = net.createServer((client) => {
      const upstream = net.connect(this.target.port, this.target.host);
      this.sockets.add(client).add(upstream);
      const close = () => {
        client.destroy();
        upstream.destroy();
        this.sockets.delete(client);
        this.sockets.delete(upstream);
      };
      client.on('error', close).on('close', close);
      upstream.on('error', close).on('close', close);
      client.pipe(upstream);
      upstream.pipe(client);
    });
  }

  async listen(): Promise<number> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    this.port = (this.server.address() as net.AddressInfo).port;
    return this.port;
  }

  /** Drops every open connection, like a network failure. */
  dropAll(): void {
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
  }

  async close(): Promise<void> {
    this.dropAll();
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}
