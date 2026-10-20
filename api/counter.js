"use strict";
// /api/counter (ver api/_lib/backend.js)
const { counter } = require("./_lib/backend");
module.exports = (req, res) => counter(req, res);
