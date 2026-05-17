export function parseSections(raw) {
  if (!raw) return {};
  var res = {};
  var mk = ["ПЛАН", "ТЕОРИЯ", "ФИНАЛЬНЫЙ БОСС", "КАРТИНКИ", "КОНСПЕКТ"];
  var ps = [];
  mk.forEach(function(n) {
    var esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("#\\s*" + esc + "\\s*:", "g");
    var m;
    while ((m = re.exec(raw)) !== null)
      ps.push({ n: n, i: m.index, l: m[0].length });
  });
  ps.sort(function(a, b) { return a.i - b.i; });
  ps.forEach(function(p, i) {
    var st = p.i + p.l;
    var en = i + 1 < ps.length ? ps[i + 1].i : raw.length;
    if (p.n !== "КАРТИНКИ") res[p.n] = raw.substring(st, en).trim();
  });
  return res;
}

export function parseBlocks(t) {
  if (!t) return [];
  var bs = [], ls = t.split("\n"), c = null, cn = "1";
  var TP = ["info", "action", "solution", "answer", "mistake_explanation", "problem"];
  ls.forEach(function(l) {
    var tr = l.trim();
    if (/^\d+$/.test(tr)) { if (c) bs.push(c); cn = tr; c = null; }
    else if (TP.indexOf(tr) !== -1) { if (c && c.type) bs.push(c); c = { num: cn, type: tr, content: "" }; }
    else if (c) { c.content += (c.content ? "\n" : "") + l; }
  });
  if (c) bs.push(c);
  return bs.filter(function(b) { return b.type; });
}

export function blocksToText(bs) {
  var o = "", ln = null;
  bs.forEach(function(b) {
    if (b.num !== ln) { o += (o ? "\n" : "") + b.num + "\n"; ln = b.num; }
    o += b.type + "\n" + b.content + "\n";
  });
  return o.trim();
}

export function sectionsToFull(sec) {
  return ["ПЛАН", "ТЕОРИЯ", "ФИНАЛЬНЫЙ БОСС", "КОНСПЕКТ"]
    .filter(function(k) { return sec[k]; })
    .map(function(k) { return "# " + k + ":\n" + sec[k]; })
    .join("\n\n");
}

export function inlineDiff(orig, edit) {
  var oL = (orig || "").split("\n");
  var eL = (edit || "").split("\n");
  // LCS
  var m = oL.length, n = eL.length, dp = [];
  for (var i = 0; i <= m; i++) {
    dp[i] = [];
    for (var j = 0; j <= n; j++) {
      if (i === 0 || j === 0) dp[i][j] = 0;
      else if (oL[i-1] === eL[j-1]) dp[i][j] = dp[i-1][j-1] + 1;
      else dp[i][j] = Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  var lcs = [], ii = m, jj = n;
  while (ii > 0 && jj > 0) {
    if (oL[ii-1] === eL[jj-1]) { lcs.unshift({ oi: ii-1, ei: jj-1 }); ii--; jj--; }
    else if (dp[ii-1][jj] > dp[ii][jj-1]) ii--;
    else jj--;
  }
  var res = [], oi = 0, ei = 0, li = 0;
  while (oi < oL.length || ei < eL.length) {
    if (li < lcs.length && oi === lcs[li].oi && ei === lcs[li].ei) {
      res.push({ t: "same", text: eL[ei] }); oi++; ei++; li++;
    } else {
      var rm = [], ad = [];
      while (oi < oL.length && (li >= lcs.length || oi < lcs[li].oi)) { rm.push(oL[oi]); oi++; }
      while (ei < eL.length && (li >= lcs.length || ei < lcs[li].ei)) { ad.push(eL[ei]); ei++; }
      var mp = Math.min(rm.length, ad.length);
      for (var k = 0; k < mp; k++) res.push({ t: "changed", old: rm[k], new_: ad[k] });
      for (var k2 = mp; k2 < rm.length; k2++) res.push({ t: "removed", text: rm[k2] });
      for (var k3 = mp; k3 < ad.length; k3++) res.push({ t: "added", text: ad[k3] });
    }
  }
  return res;
}
