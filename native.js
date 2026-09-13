import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const device = registerPlugin('FolioDevice');

// Acknowledgement follows the IndexedDB commit. Native copies survive interruption.
export async function receiveNativeFiles({ add, open, changed, report }) {
  if (!isNative) return;
  let running = false, again = false;
  const receive = async () => {
    if (running) { again = true; return; }
    running = true;
    try {
      do {
        again = false;
        const { files } = await device.pendingFiles();
        let latest;
        const errors = [];
        for (const file of files) {
          try {
            if (file.error) { errors.push(file.error); await device.ackFile({ id: file.id }); continue; }
            latest = await add(file.content, file.name, undefined, `native-${file.id}`);
            await device.ackFile({ id: file.id });
          } catch { errors.push(`${file.name}: Could not save. The incoming copy is kept; free some storage and reopen Folio to retry.`); }
        }
        if (latest) await open(latest.id);
        changed();
        if (errors.length) report(errors.join('\n'));
      } while (again);
    } catch { report('Incoming files could not be read. Reopen Folio to retry.'); }
    finally { running = false; }
  };
  await device.addListener('incomingFiles', receive);
  await receive();
}
