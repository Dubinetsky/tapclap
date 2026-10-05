// TC-03 — Cascade and refill
// Автоматически создаём одну валидную комбинацию.
// После всех анимаций поле снова должно читаться как полная стабильная сетка.
// Этот сценарий не считает количество каскадов: его задача — убедиться,
// что после разрешения хода WARDEN снова получает целое игровое состояние.

(async () => {
  const warden =
    window.warden ||
    (window.warden = await WARDEN.init({
      rows: 7,
      cols: 7,
      cellSize: 72,
      expectedTypes: 6
    }));

  const moves = warden.legalMoves();

  warden.assert(
    moves.length > 0,
    'TC-03: expected at least one legal move'
  );

  const result =
    await warden.perform(moves[0], {
      requireLegal: true,
      expectChange: true
    });

  warden.assert(
    result.changed,
    'TC-03: board did not change after legal move'
  );

  const settled = await warden.waitStable();

  warden.assert(
    settled.complete,
    'TC-03: board is incomplete after cascade/refill'
  );

  warden.assert(
    settled.safe,
    'TC-03: board did not return to a safe readable state'
  );

  console.log('[TC-03] PASS', {
    result,
    settled: settled.board
  });
})();
