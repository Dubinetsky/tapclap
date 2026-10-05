// TC-07 — Input lock watch
// Цель сценария — поймать состояние, при котором независимый solver видит
// legal move, WARDEN отправляет корректный drag, но итоговое состояние поля
// не меняется.
//
// Такой результат не объявляет root cause. Он сохраняет диагностический
// snapshot и сообщает конкретный ход и доску, на которых ввод не был принят.

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
      maxSteps: 50,
      pause: 350
    });

  const lock =
    history.find(
      item =>
        item.status === 'INPUT_NO_CHANGE' ||
        (
          item.status === 'BOARD_UNCHANGED' &&
          item.legal === true
        )
    );

  if (!lock) {
    console.log(
      '[TC-07] NOT REPRODUCED',
      {
        successfulMoves:
          history.filter(x => x.status === 'MOVED').length,
        final: history.at(-1),
        snapshot: warden.snapshot()
      }
    );
    return;
  }

  console.error(
    '[TC-07] INPUT LOCK CANDIDATE',
    {
      lock,
      snapshot: warden.snapshot()
    }
  );
})();
