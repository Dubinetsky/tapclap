// TC-02 — Invalid adjacent swap
// Выбираем соседнюю пару, которая по независимому solver не создаёт match-3.
// После завершения возможной reject-анимации итоговая доска должна совпасть
// с исходной.

(async () => {
  const warden =
    window.warden ||
    (window.warden = await WARDEN.init({
      rows: 7,
      cols: 7,
      cellSize: 72,
      expectedTypes: 6
    }));

  const move = warden.findInvalidAdjacent();

  warden.assert(
    !!move,
    'TC-02: no invalid adjacent pair found'
  );

  const result =
    await warden.perform(move, {
      requireLegal: false,
      expectChange: false
    });

  warden.assert(
    !result.changed,
    'TC-02: invalid swap changed the final board state'
  );

  console.log('[TC-02] PASS', result);
})();
