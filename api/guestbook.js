"use strict";
// /api/guestbook (ver api/_lib/backend.js)
const { guestbook } = require("./_lib/backend");
module.exports = (req, res) => guestbook(req, res);
