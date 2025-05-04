import { DurableObject } from 'cloudflare:workers';

export interface Env {
  WEBSOCKET_HIBERNATION_SERVER: DurableObjectNamespace<WebSocketHibernationServer>;
}

export default {
  async fetch(
    request: Request,
    env: Env
  ): Promise<Response> {
    if (request.url.includes('/ws')) {
      console.debug('WebSocket request received');

      const upgradeHeader = request.headers.get('Upgrade');
      if (!upgradeHeader || upgradeHeader !== 'websocket') {
        return new Response('Durable Object expected Upgrade: websocket', {
          status: 426,
        });
      }

      const roomId = request.url.split('/').pop();

      const id = env.WEBSOCKET_HIBERNATION_SERVER.idFromName(roomId ?? '');
      const stub = env.WEBSOCKET_HIBERNATION_SERVER.get(id);

      return stub.fetch(request);
    }

    return new Response(null, {
      status: 400,
      statusText: 'Bad Request',
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  },
} satisfies ExportedHandler<Env>;

export class WebSocketHibernationServer extends DurableObject {
  async fetch(): Promise<Response> {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(
    _ws: WebSocket, 
    message: ArrayBuffer | string
  ) {
    this.broadcastMsg(
      // ws, 
      message
    );
  }

  broadcastMsg(
    // ws: WebSocket, 
    message: ArrayBuffer | string
  ) {
    for (const session of this.ctx.getWebSockets()) {
      // if (session !== ws) { // filter out main connection, add back later
      session.send(
        JSON.stringify({
          message: message,
          connections: this.ctx.getWebSockets().length,
          id: this.ctx.id,
        })
      );
      // }
    }
  }

  async webSocketClose(
    ws: WebSocket,
    code: number
  ) {
    ws.close(code, 'Durable Object is closing WebSocket');
  }
}
