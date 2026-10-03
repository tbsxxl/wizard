import assert from "node:assert/strict";
await import("../public/rules.js");
const R = globalThis.WizardRules;

assert.equal(R.score(0, 0), 20);
assert.equal(R.score(3, 3), 50);
assert.equal(R.score(2, 4), -20);
assert.equal(R.score(4, 1), -30);

assert.equal(R.maxHand(3), 20);
assert.equal(R.maxHand(4), 15);
assert.equal(R.maxHand(5), 12);
assert.equal(R.maxHand(6), 10);
assert.equal(R.maxHand(2), 20, "auf 20 Runden begrenzt");

assert.deepEqual(R.schedule("standard", 3), [1, 2, 3]);
assert.deepEqual(R.schedule("updown", 3), [1, 2, 3, 2, 1]);
assert.deepEqual(R.schedule("updown", 1), [1]);
assert.equal(R.schedule("manual", 5), null);

assert.equal(R.forbiddenBid(3, [1, 1]), 1);
assert.equal(R.forbiddenBid(3, [0, 0]), 3);
assert.equal(R.forbiddenBid(3, [2, 2]), null, "schon überboten → alles erlaubt");

assert.equal(R.dealerOf(0, 2, 4), 2);
assert.equal(R.dealerOf(3, 2, 4), 1);
assert.equal(R.firstBidderOf(0, 3, 4), 0);

const P = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
const rounds = [
  { hand: 1, bids: { a: 1, b: 0, c: 0 }, tricks: { a: 1, b: 0, c: 0 } },   // a 30, b 20, c 20
  { hand: 2, bids: { a: 0, b: 1, c: 0 }, tricks: { a: 1, b: 1, c: 0 } },   // a -10, b 30, c 20
];
assert.deepEqual(R.totals(P, rounds), { a: 20, b: 50, c: 40 });
const s = R.standings(P, rounds);
assert.deepEqual(s.map((p) => [p.id, p.rank]), [["b", 1], ["c", 2], ["a", 3]]);
const tie = R.standings(P, [{ hand: 1, bids: { a: 0, b: 0, c: 1 }, tricks: { a: 0, b: 0, c: 0 } }]);
assert.deepEqual(tie.map((p) => [p.id, p.rank]), [["a", 1], ["b", 1], ["c", 3]], "geteilte Plätze");

console.log("rules: alle Tests ok");
