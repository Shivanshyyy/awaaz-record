import { describe, expect, it } from 'vitest';
import { APP_NAME, TABS } from './app/meta';

describe('app shell', () => {
  it('names the app and lists the four tabs in order', () => {
    expect(APP_NAME).toBe('Awaaz Record');
    expect(TABS.map((t) => t.name)).toEqual(['today', 'new', 'records', 'tasks']);
  });
});
