/* Cross-section shortcuts. Sections talk to each other through window
   events so none of them needs App's state: App listens for
   'anonvault:goto' and 'anonvault:add-task'; Board listens for
   'anonvault:open-card'; Money for 'anonvault:money-tab'. */

const fire = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));

export function goTo(tab) { fire('anonvault:goto', tab); }

export function openCard(id) {
  goTo('board');
  setTimeout(() => fire('anonvault:open-card', id), 60);
}

/** Add a one-off task to the checklist (today unless `date` is given). */
export function addToChecklist(title, date) { fire('anonvault:add-task', { title, date }); }

/** Ask once for permission to show a desktop notice when a timed block ends. */
export function askNotify() {
  try {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  } catch { /* unsupported */ }
}

export function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body });
  } catch { /* unsupported */ }
}
