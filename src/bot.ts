// Telegram commands and buttons on top of the App.

import { Bot, GrammyError, InlineKeyboard, type Context } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';

import { BlockedError, type App } from './app.ts';
import { renderSchedule, renderStatus } from './messages.ts';
import { GROUPS } from './schedule.ts';

const FIND_GROUP_URL = 'https://www.dtek-dnem.com.ua/ua/shutdowns';

const OPTIONS = { parse_mode: 'HTML', link_preview_options: { is_disabled: true } } as const;

const COMMANDS = [
  { command: 'start', description: 'Почати й обрати чергу' },
  { command: 'status', description: 'Що зараз за графіком' },
  { command: 'schedule', description: 'Графік на сьогодні й завтра' },
  { command: 'settings', description: 'Черга й сповіщення' },
];

// Shown in an empty chat before "Start" (up to 512 characters).
const DESCRIPTION = [
  'Повідомляю про планові відключення світла в Дніпрі за графіками DTEK.',
  '',
  '• Коли опублікують графік на завтра',
  '• Коли графік зміниться, навіть уночі, з порівнянням «було → стало»',
  '• За 30 хвилин до відключення та до повернення світла',
  '• Окремо про можливі відключення (можна вимкнути)',
  '',
  'Оберіть свою чергу, і я писатиму лише тоді, коли це важливо.',
].join('\n');

// Profile and link previews (up to 120 characters).
const SHORT_DESCRIPTION = 'Графік відключень світла в Дніпрі: зміни, публікації та нагадування за 30 хвилин для вашої черги.';

// Shown only in the Admin's chat.
const ADMIN_COMMANDS = [
  ...COMMANDS,
  { command: 'admin', description: 'Стан джерел і кількість підписників' },
  { command: 'captcha', description: 'Відкрити DTEK для проходження перевірки' },
];

export type BotDeps = {
  token: string;
  app: App;
  adminChatId: number;
  /** Opens DTEK in a visible browser for the Admin to pass the captcha via noVNC. */
  startCaptchaSession: () => Promise<string>;
};

function groupKeyboard() {
  const keyboard = new InlineKeyboard();
  GROUPS.forEach((group, i) => {
    keyboard.text(group, `group:${group}`);
    if (i % 4 === 3) keyboard.row();
  });
  return keyboard.url('Дізнатися свою чергу', FIND_GROUP_URL);
}

export function createBot({ token, app, adminChatId, startCaptchaSession }: BotDeps) {
  const bot = new Bot(token);
  bot.api.config.use(autoRetry());

  const settingsKeyboard = (chatId: number) => {
    const s = app.subscriber(chatId)!;
    return new InlineKeyboard()
      .text(`Черга: ${s.group} · змінити`, 'settings:group').row()
      .text(`Сповіщення: ${s.notify ? 'увімкнено' : 'вимкнено'}`, 'settings:notify').row()
      .text(`Можливі відключення: ${s.possible ? 'нагадувати' : 'не нагадувати'}`, 'settings:possible');
  };

  /** Runs `then` for a Subscriber, or asks to choose a Group first. */
  const withSubscriber = (then: (ctx: Context, group: string) => Promise<unknown>) => async (ctx: Context) => {
    const subscriber = app.subscriber(ctx.chat!.id);
    if (!subscriber) return ctx.reply('Спершу оберіть свою чергу:', { reply_markup: groupKeyboard() });
    return then(ctx, subscriber.group);
  };

  bot.command('start', (ctx) =>
    ctx.reply(
      [
        'Вітаю! Я повідомлю, коли за графіком DTEK у вашій черзі вимикатимуть і вмикатимуть світло:',
        '• коли опублікують графік на завтра,',
        '• коли графік зміниться, навіть уночі,',
        '• за 30 хвилин до відключення та до повернення світла.',
        '',
        'Оберіть свою чергу:',
      ].join('\n'),
      { reply_markup: groupKeyboard() },
    ));

  bot.command('status', withSubscriber((ctx, group) => {
    const schedule = app.schedule(group, Date.now());
    if (!schedule) return ctx.reply('Графіків поки немає: джерела ще не відповіли. Спробуйте за кілька хвилин.');
    return ctx.reply(renderStatus(schedule.days, Date.now()) + schedule.note, OPTIONS);
  }));

  bot.command('schedule', withSubscriber((ctx, group) => {
    const schedule = app.schedule(group, Date.now());
    if (!schedule) return ctx.reply('Графіків поки немає: джерела ще не відповіли. Спробуйте за кілька хвилин.');
    return ctx.reply(renderSchedule(schedule.days, group, Date.now()) + schedule.note, OPTIONS);
  }));

  bot.command('settings', withSubscriber((ctx) => ctx.reply('Налаштування:', { reply_markup: settingsKeyboard(ctx.chat!.id) })));

  bot.callbackQuery(/^group:(.+)$/, async (ctx) => {
    const group = ctx.match[1];
    if (!GROUPS.includes(group)) return ctx.answerCallbackQuery();
    const now = Date.now();
    app.subscribe(ctx.chat!.id, group, now);
    await ctx.answerCallbackQuery(`Черга ${group}`);
    const schedule = app.schedule(group, now);
    const body = schedule ? `\n\n${renderSchedule(schedule.days, group, now)}${schedule.note}` : '';
    await ctx.editMessageText(`Збережено: черга ${group}. Змінити можна в /settings.${body}`, OPTIONS);
  });

  bot.callbackQuery('settings:group', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('Оберіть нову чергу:', { reply_markup: groupKeyboard() });
  });

  bot.callbackQuery(/^settings:(notify|possible)$/, async (ctx) => {
    const chatId = ctx.chat!.id;
    const subscriber = app.subscriber(chatId);
    if (!subscriber) return ctx.answerCallbackQuery('Спершу оберіть чергу: /start');
    if (ctx.match[1] === 'notify') app.setNotify(chatId, !subscriber.notify, Date.now());
    else app.setPossible(chatId, !subscriber.possible);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(chatId) });
  });

  bot.command('admin', (ctx) => {
    if (ctx.chat.id !== adminChatId) return;
    return ctx.reply(app.adminStatus(Date.now()));
  });

  bot.command('captcha', async (ctx) => {
    if (ctx.chat.id !== adminChatId) return;
    await ctx.reply('Відкриваю сайт DTEK у браузері сервера. Пройдіть перевірку через noVNC, у вас 10 хвилин.');
    // Not awaited: grammY handles updates one by one, and this can take minutes.
    startCaptchaSession()
      .then((result) => ctx.reply(result))
      .catch((error) => ctx.reply(`Не вдалося: ${(error as Error).message}`));
  });

  bot.catch((error) => console.error('Bot error:', error.error));

  return {
    bot,
    async start() {
      await bot.api.setMyCommands(COMMANDS);
      await bot.api.setMyCommands(ADMIN_COMMANDS, { scope: { type: 'chat', chat_id: adminChatId } });
      await bot.api.setMyDescription(DESCRIPTION);
      await bot.api.setMyShortDescription(SHORT_DESCRIPTION);
      void bot.start({ drop_pending_updates: true });
    },
    async send(chatId: number, text: string) {
      try {
        await bot.api.sendMessage(chatId, text, OPTIONS);
      } catch (error) {
        // 403: the user blocked the bot or deleted the chat.
        if (error instanceof GrammyError && error.error_code === 403) throw new BlockedError(error.description);
        throw error;
      }
    },
  };
}
