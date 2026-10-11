import { newestSeenIso } from '../clock';
import { parseFile, type ParseReply, type ParseRequest } from './parseFile';

// Worker entry: validates the files of a request and posts the results back.
// Built inline into the app (vite `?worker&inline`), so the build stays one classic script.

addEventListener('message', (e: MessageEvent<ParseRequest>) => {
  const reply: ParseReply = {
    id: e.data.id,
    results: e.data.items.map((item) => parseFile(item.kind, item.text)),
    newest: newestSeenIso(),
  };
  postMessage(reply);
});
