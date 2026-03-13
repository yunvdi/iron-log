# Iron Log — Инструкция по деплою

## Что тебе нужно сделать (займёт ~15 минут)

---

## Шаг 1 — Supabase (облачная база данных)

1. Зайди на https://supabase.com → Sign Up (бесплатно)
2. Нажми **New Project**, дай название "iron-log", выбери регион Europe
3. Подожди ~1 минуту пока проект создаётся
4. Слева зайди в **SQL Editor** и выполни этот запрос:

```sql
CREATE TABLE user_data (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text UNIQUE NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON user_data FOR ALL USING (true) WITH CHECK (true);
```

5. Зайди в **Settings → API**
6. Скопируй:
   - **Project URL** (выглядит как `https://xxxxx.supabase.co`)
   - **anon public** key (длинная строка)

---

## Шаг 2 — GitHub (хранилище кода)

1. Зайди на https://github.com → Sign Up (бесплатно)
2. Нажми **New repository**, название "iron-log", выбери Public, нажми Create
3. Загрузи все файлы из папки `iron-log` в репозиторий через кнопку **Add file → Upload files**
   - Загружай папку src целиком + все остальные файлы

---

## Шаг 3 — Vercel (хостинг)

1. Зайди на https://vercel.com → Sign Up через GitHub
2. Нажми **Add New Project**, выбери репозиторий "iron-log"
3. Перед деплоем нажми **Environment Variables** и добавь две переменные:
   - `VITE_SUPABASE_URL` = твой Project URL из Supabase
   - `VITE_SUPABASE_ANON_KEY` = твой anon key из Supabase
4. Нажми **Deploy**
5. Через минуту получишь ссылку вида `https://iron-log-xxx.vercel.app`

---

## Готово!

Открывай ссылку на телефоне и компьютере — данные синхронизируются автоматически.

**Важно:** При первом открытии на каждом устройстве генерируется уникальный ID.
Чтобы один аккаунт работал на всех устройствах — в будущем можно добавить авторизацию (Google Login). Напиши если нужно.
