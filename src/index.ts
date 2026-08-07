export default {
  async fetch(): Promise<Response> {
    return new Response('Pikiwedia: the lee enfrycodepia. Coming soon.', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
} satisfies ExportedHandler;
