import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function serveFrontend(app, distDir) {
  const indexPath = path.join(distDir, 'index.html');
  if (!existsSync(indexPath)) return false;
  app.use('/assets', express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(distDir, { index: false, maxAge: 0 }));
  app.get(/^\/(?:project\/(?:default|[a-f0-9-]{36})\/?)?$/, (_request, response) => {
    response.set('Cache-Control', 'no-cache');
    response.sendFile(indexPath);
  });
  return true;
}
