export const APP_NAME = 'Awaaz Record';

export const TABS = [
  { name: 'today', label: 'Today', icon: 'home' },
  { name: 'new', label: 'New visit', icon: 'mic' },
  { name: 'records', label: 'Records', icon: 'folder' },
  { name: 'tasks', label: 'Tasks', icon: 'tasks' },
] as const;

export type TabName = (typeof TABS)[number]['name'];
