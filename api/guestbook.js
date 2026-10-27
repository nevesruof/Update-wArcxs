"use strict";
const { guestbook } = require("./_lib/backend");
module.exports = (req, res) => guestbook(req, res);
