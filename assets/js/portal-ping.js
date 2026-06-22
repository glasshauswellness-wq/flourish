(function () {
  'use strict';

  var GLASSHAUS_API = 'https://glasshauswellness.com/api';

  var isDev = (
    window.location.hostname === 'localhost' ||
    window.location.hostname.indexOf('.replit.dev') !== -1 ||
    window.location.hostname.indexOf('.worf.replit.dev') !== -1
  );

  function log() {
    if (isDev && window.console && console.log) {
      console.log.apply(console, ['[portal-ping]'].concat(Array.prototype.slice.call(arguments)));
    }
  }

  function getVisitorToken() {
    try {
      var raw = localStorage.getItem('vita_session');
      if (!raw) return undefined;
      var s = JSON.parse(raw);
      return (s && s.ost) ? s.ost : undefined;
    } catch (e) { return undefined; }
  }

  function fire(portalToken) {
    var payload = {
      site:     'flourish',
      path:     window.location.pathname,
      referrer: document.referrer || null
    };

    var ost = getVisitorToken();
    if (ost) payload.visitor_token = ost;

    var headers = { 'Content-Type': 'application/json' };
    if (portalToken) headers['X-Portal-Token'] = portalToken;

    log('firing', payload);

    fetch(GLASSHAUS_API + '/portal/ping', {
      method:  'POST',
      headers: headers,
      body:    JSON.stringify(payload)
    }).then(function (res) {
      log('response', res.status);
    }).catch(function (err) {
      log('ping failed —', err.message);
    });
  }

  function init() {
    fetch('/api/config')
      .then(function (res) { return res.json(); })
      .then(function (cfg) {
        fire(cfg.portalToken || null);
      })
      .catch(function (err) {
        log('config fetch failed, pinging without token —', err.message);
        fire(null);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
