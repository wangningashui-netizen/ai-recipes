# 如水食单

下厨房热门菜谱选题库。静态网站，托管在 GitHub Pages：从 `main` 分支**根目录**直接发布，打开页面不需要构建。

界面是简体中文，给手机看也给电脑看。打开后直接是最新一天的菜谱，更早的日子按日期接在下面，新的在上，不用先选日期。可以按菜名、用料、作者搜索，也可以按分类和榜单筛选。点开一张卡片能看大图、用量、步骤数和短介绍，再去下厨房看完整做法，或一键复制菜名和用料，当作选题笔记。

本地预览（不要用 `file://` 打开，浏览器会拦截读取 JSON）：

```bash
python3 -m http.server 8080
```

然后访问 <http://localhost:8080>。

GitHub Pages：仓库 Settings → Pages → Build and deployment → Deploy from a branch → Branch `main`、文件夹 `/ (root)`。根目录的空文件 `.nojekyll` 让 Pages 按原样提供全部文件（包括 `images/`）。资源都用相对路径，项目页（`https://<user>.github.io/<repo>/`）可以直接用。

## 每天怎么加一天

只改数据，**不要**改 `index.html`、`styles.css`、`app.js`：

1. 新建目录 `images/YYYY-MM-DD/`，放入这一天的成品图，文件名用菜谱 id，例如 `images/2026-11-10/107491076.jpg`。
2. 新建 `data/YYYY-MM-DD.json`（格式见下）。`date` 与文件名、图片目录名相同。
3. 在 `data/index.json` 的 `dates` **最前面**插入这一天（最新在前），`count` 写成当天 `entries` 的条数。

页面不扫描目录。一张图要显示，就要写进当天 JSON 的 `image.local`。日期列表会再按 `date` 从新到旧排一次，所以即使没插在最前面，最新的一天仍会出现在页面最上。文件本身仍应保持最新在前。

推到 `main` 之后，Pages 会用新的数据。页面读取 JSON 时避开缓存，一般刷新就能看到新的一天。

## 页面怎么用这些文件

1. 先读 `data/index.json`。
2. 再按里面的 `file` 逐个读取每天的 JSON。
3. 卡片上的图用 `image.local`（相对网站根目录）。本地文件打不开、并且 `image.source` 是 `https://` 地址时，才改去请求原图。

`image.local` 不要写成网址，也不要以 `/` 开头，不要包含 `..`。

## `data/index.json`

```json
{
  "schemaVersion": 1,
  "dates": [
    { "date": "2026-11-10", "file": "data/2026-11-10.json", "count": 40 },
    { "date": "2026-11-09", "file": "data/2026-11-09.json", "count": 49 }
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | number | 固定 `1`。要改字段含义时才递增，并且同时改页面。 |
| `dates` | array | 有哪些天。请按日期从新到旧排。 |
| `dates[].date` | string | `YYYY-MM-DD`。 |
| `dates[].file` | string | 相对网站根目录，形如 `data/YYYY-MM-DD.json`。不要以 `/` 开头。 |
| `dates[].count` | number | 当天菜谱条数，给人核对用。页面按文件里的 `entries` 显示，不靠这个数字。 |

## `data/YYYY-MM-DD.json`

```json
{
  "schemaVersion": 1,
  "date": "2026-11-09",
  "timezone": "Asia/Shanghai",
  "entries": [
    {
      "id": "107491076",
      "name": "蒜蓉蚝油生菜",
      "url": "https://www.xiachufang.com/recipe/107491076/",
      "author": "随便做做xx",
      "score": 7.6,
      "made": 190,
      "desc": null,
      "ingredients": [
        { "name": "生菜", "amount": "一个" },
        { "name": "蒜", "amount": "5瓣" }
      ],
      "stepCount": 8,
      "steps": [
        {
          "n": 1,
          "text": "准备料汁。",
          "image": { "url": "https://i2.chuimg.com/example.jpg?imageView2/2/w/640/interlace/1/q/80" }
        },
        { "n": 2, "text": "大蒜切成蒜末。", "image": null }
      ],
      "lists": ["popular"],
      "rank": { "popular": 1 },
      "image": {
        "local": "images/2026-11-09/107491076.jpg",
        "source": "https://i2.chuimg.com/example.jpg"
      },
      "category": "家常菜"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | number | 固定 `1`。 |
| `date` | string | `YYYY-MM-DD`，与文件名一致。 |
| `timezone` | string | `Asia/Shanghai`。日期按北京时间。 |
| `entries` | array | 这一天的菜谱，页面保持文件里的顺序。可以是空数组。 |
| `entries[].id` | string | 下厨房菜谱 id。写成字符串。图片文件名用同一个 id。 |
| `entries[].name` | string | 菜名。没有菜名的条目会被跳过。 |
| `entries[].url` | string | 原文地址，须是 `https://`。详情里的「查看下厨房原文」打开这个链接（新标签页）。 |
| `entries[].author` | string | 作者。搜索会查这里。 |
| `entries[].score` | number 或 null | 评分。没有或是 `0` 就不显示。 |
| `entries[].made` | number 或 null | 做过人数。没有或是 `0` 就不显示。 |
| `entries[].desc` | string 或 null | 短介绍。没有就写 `null` 或 `""`，详情里不显示这一段。 |
| `entries[].ingredients` | array | 用料。每一项是 `{ "name", "amount" }`。用量可以是空字符串。两项都空的会被忽略。 |
| `entries[].stepCount` | number | 步骤数，给人核对用。页面按 `steps` 显示做法。 |
| `entries[].lists` | array | 榜单。`popular` 显示为「本周最受欢迎」，`rising` 显示为「新秀菜谱」。可以写多个。 |
| `entries[].rank` | object | 名次。`popular`、`rising` 用数字，例如 `{ "popular": 1 }`。徽章会写成「本周最受欢迎 · 1」。 |
| `entries[].image.local` | string | 站内成品图，相对路径，例如 `images/2026-11-09/107491076.jpg`。 |
| `entries[].image.source` | string | 原图 `https://` 地址。只在本地图打不开时用作备用。 |
| `entries[].steps` | array | 做法。可为空数组。空的时候详情只写一句说明，并保留去原文的按钮。 |
| `entries[].steps[].n` | number | 步骤序号，从 1 开始。 |
| `entries[].steps[].text` | string | 这一步的文字。可以是空字符串（只有图）。 |
| `entries[].steps[].image` | object 或 null | 步骤图。没有就写 `null`。不要把步骤图放进仓库。 |
| `entries[].steps[].image.url` | string | 下厨房图床的 `https://` 地址。页面热链这张图，并加上 `referrerpolicy="no-referrer"`，否则图床会返回 403。加载失败就藏起图片，文字还在。 |
| `entries[].category` | string | 分类。已知的是：家常菜、快手菜、汤羹、烘焙甜点、凉菜小吃、主食面点、饮品。卡片上会显示。多出来的分类会自动出现在筛选里，不用改页面。 |

搜索只查菜名、用料（名称和用量）和作者。分类、榜单和搜索可以一起用。

菜谱正文和图片的版权归下厨房及原作者所有。这个站只作选题参考。
