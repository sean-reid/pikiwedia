import { handle } from './proxy';

export default {
  fetch(request: Request): Promise<Response> {
    return handle(request);
  },
} satisfies ExportedHandler;
