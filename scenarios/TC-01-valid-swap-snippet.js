// TC-01 — Valid match-3 swap
// Проверяем, что WARDEN находит допустимый ход, отправляет его в игру,
// а после завершения анимации логическое состояние поля изменяется.

(async () => {
  const warden =
    window.warden ||
    (window.warden = await WARDEN.init({
      rows: 7,
      cols: 7,
      cellSize: 72,
      expectedTypes: 6
    }));

  await warden.waitStable();

  const moves = warden.legalMoves();

  warden.assert(
    moves.length > 0,
    'TC-01: expected at least one legal move'
  );

  const result =
    await warden.perform(moves[0], {
      requireLegal: true,
      expectChange: true
    });

  warden.assert(
    result.changed,
    'TC-01: legal swap did not change the board'
  );

  console.log('[TC-01] PASS', result);
})();
