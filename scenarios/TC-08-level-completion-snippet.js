// TC-08 — Level completion watch
// WARDEN продолжает делать допустимые ходы до одного из условий:
// - обычная игровая сетка исчезла / сменилась сцена;
// - legal moves закончились;
// - найден input lock;
// - достигнут защитный лимит ходов.
//
// Исчезновение обычной сетки считается только кандидатом на переход уровня.
// Финальное окно/экран завершения проверяется человеком вручную.

(async () => {
  const warden =
    window.warden ||
    (window.warden = await WARDEN.init({
      rows: 7,
      cols: 7,
      cellSize: 72,
      expectedTypes: 6
    }));

  const history =
    await warden.run({
      maxSteps: 100,
      pause: 350
    });

  const final = history.at(-1);

  if (
    final?.status ===
    'BOARD_OR_SCENE_DISAPPEARED'
  ) {
    console.log(
      '[TC-08] TRANSITION CANDIDATE: board disappeared. Verify completion UI manually.',
      {
        final,
        snapshot: warden.snapshot()
      }
    );
    return;
  }

  if (final?.status === 'NO_LEGAL_MOVE') {
    console.warn(
      '[TC-08] STOPPED: no legal move detected. Verify whether this is expected.',
      final
    );
    return;
  }

  if (
    final?.status === 'INPUT_NO_CHANGE' ||
    final?.status === 'BOARD_UNCHANGED'
  ) {
    console.error(
      '[TC-08] STOPPED: board did not react to a legal move',
      final
    );
    return;
  }

  console.log(
    '[TC-08] LIMIT REACHED: completion was not observed within the configured move limit',
    {
      moves: history.length,
      final
    }
  );
})();
