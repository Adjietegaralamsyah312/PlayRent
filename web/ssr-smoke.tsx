import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from './src/lib/auth';
import { ToastProvider } from './src/lib/toast';
import { Beranda } from './src/pages/Beranda';
import { BookingSaya } from './src/pages/BookingSaya';
import { InfoRental } from './src/pages/InfoRental';
import { Akun } from './src/pages/Akun';
import { setMode } from './smoke-useasync-stub.ts';

const pages = { Beranda, BookingSaya, InfoRental, Akun };

let failed = 0;
for (const mode of ['data', 'empty', 'error', 'loading'] as const) {
  setMode(mode);
  for (const [name, Page] of Object.entries(pages)) {
    try {
      const html = renderToString(
        <MemoryRouter>
          <AuthProvider>
            <ToastProvider>
              <Page />
            </ToastProvider>
          </AuthProvider>
        </MemoryRouter>,
      );
      const marker = mode === 'data' ? 'ok  ' : 'ok  ';
      process.stdout.write(`${marker} ${mode.padEnd(7)} ${name.padEnd(12)} ${String(html.length).padStart(6)} chars\n`);
    } catch (e) {
      failed += 1;
      process.stdout.write(`FAIL ${mode} ${name}: ${(e as Error).message}\n`);
    }
  }
}
process.stdout.write(failed === 0 ? '\nall renders passed\n' : `\n${failed} render(s) failed\n`);
process.exit(failed === 0 ? 0 : 1);
