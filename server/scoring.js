'use strict';
/** Sunucu tarafı: public/js/game/scoring.js ile AYNI modülü içe aktarır. */
const path = require('path');
const { pathToFileURL } = require('url');

const scoringPath = path.join(__dirname, '..', 'public', 'js', 'shared', 'scoring.js');
const scoringPromise = import(pathToFileURL(scoringPath).href);

module.exports = {
  scoring: scoringPromise,
  /** skor doğrulama + kabul işlemleri */
  async validate() { return scoringPromise; },
};
