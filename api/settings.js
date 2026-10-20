"use strict";
// /api/settings (ver api/_lib/backend.js)
const { settings } = require("./_lib/backend");
module.exports = (req, res) => settings(req, res);
