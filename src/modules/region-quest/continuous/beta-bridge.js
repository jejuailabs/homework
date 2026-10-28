(() => {
  'use strict';
  if (window.parent === window) return;
  const key = 'region-quest-aewol-continuous-v1', pending = new Map();
  let serial = 0, loaded = null, memory = null, remote = false, saves = Promise.resolve();
  const stateKeys = ['v','phase','position','facing','resume','travelMode'];
  const object = p => Boolean(p && typeof p === 'object' && !Array.isArray(p));
  const exact = (p, keys) => object(p) && Object.keys(p).length === keys.length && keys.every(k => Object.hasOwn(p,k));
  const point = p => exact(p,['x','y']) && [p.x,p.y].every(n => Number.isFinite(n) && n >= 0 && n <= 10000);
  function serialize(value) {
    if (!exact(value,stateKeys) || value.v !== 1 || !['meet','bend','coast','done'].includes(value.phase)
      || !['down','left','right','up'].includes(value.facing) || !point(value.position)
      || (value.resume !== null && !point(value.resume)) || !['walk','car'].includes(value.travelMode)) return null;
    const raw = JSON.stringify(value);
    return raw.length <= 4096 ? raw : null;
  }
  function request(type, state) {
    return new Promise((resolve,reject) => {
      const requestId = ++serial;
      const timer = setTimeout(() => {pending.delete(requestId);reject(new Error('beta-storage-timeout'));}, 2000);
      pending.set(requestId,{type,resolve,reject,timer});
      try {window.parent.postMessage({type,requestId,...(state === undefined ? {} : {state})},'*');}
      catch (error) {clearTimeout(timer);pending.delete(requestId);reject(error);}
    });
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !object(event.data)) return;
    const data = event.data, item = pending.get(data.requestId);
    if (!item) return;
    if (item.type === 'region-quest-load') {
      if (data.type !== 'region-quest-state' || typeof data.available !== 'boolean'
        || (data.state !== null && serialize(data.state) === null)) return;
    } else if (data.type !== 'region-quest-saved' || typeof data.ok !== 'boolean') return;
    clearTimeout(item.timer);pending.delete(data.requestId);item.resolve(data);
  });
  globalThis.RQ_STORAGE = {
    async getItem(name) {
      if (name !== key) return null;
      loaded ??= request('region-quest-load').then(data => {
        remote = data.available;
        memory = data.state === null ? null : serialize(data.state);
      }).catch(() => {remote = false;});
      await loaded;
      return memory;
    },
    async setItem(name, raw) {
      if (name !== key || typeof raw !== 'string' || raw.length > 4096) throw new Error('beta-storage-value');
      let state;
      try {state = JSON.parse(raw);} catch {throw new Error('beta-storage-value');}
      const clean = serialize(state);
      if (clean === null) throw new Error('beta-storage-value');
      memory = clean;
      const save = saves.catch(() => {}).then(async () => {
        if (!loaded) throw new Error('beta-storage-not-loaded');
        await loaded;
        if (!remote) throw new Error('beta-storage-unavailable');
        try {
          const response = await request('region-quest-save',state);
          if (!response.ok) throw new Error('beta-storage-conflict');
        } catch (error) {remote = false;throw error;}
      });
      saves = save;
      return save;
    },
  };
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    window.parent.postMessage({type:'region-quest-close'},'*');
  });
})();
