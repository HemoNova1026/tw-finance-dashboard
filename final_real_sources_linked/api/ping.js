// final_real_sources_linked/api/ping.js
module.exports = (req, res) => {
  res.status(200).json({ ok: true, now: Date.now() });
};
