const glados = async () => {
  const notice = []

  if (!process.env.GLADOS) return

  const origins = [
    'https://glados.cloud',
    'https://glados.network',
    'https://glados.rocks',
  ]

  for (const rawCookie of String(process.env.GLADOS).split('\n')) {
    const cookie = rawCookie.trim()
    if (!cookie) continue

    let success = false
    let lastError = null

    for (const origin of origins) {
      try {
        const common = {
          'cookie': cookie,
          'accept': 'application/json, text/plain, */*',
          'origin': origin,
          'referer': `${origin}/console/checkin`,
          'user-agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) ' +
            'Chrome/120.0.0.0 Safari/537.36',
        }

        // 1. 先检查 Cookie 是否真的处于登录状态
        const statusResponse = await fetch(
          `${origin}/api/user/status`,
          {
            method: 'GET',
            headers: common,
          }
        )

        const status = await statusResponse.json()

        if (
          !statusResponse.ok ||
          status?.code !== 0 ||
          !status?.data
        ) {
          lastError = new Error(
            `${new URL(origin).hostname} 登录状态无效: ` +
            `${status?.message || `HTTP ${statusResponse.status}`}`
          )
          continue
        }

        // 2. 登录状态正常后再签到
        const actionResponse = await fetch(
          `${origin}/api/user/checkin`,
          {
            method: 'POST',
            headers: {
              ...common,
              'content-type': 'application/json;charset=UTF-8',
            },
            body: JSON.stringify({
              token: new URL(origin).hostname,
            }),
          }
        )

        const action = await actionResponse.json()
        const message = String(action?.message || '')

        // code=0: 签到成功
        // code=1: 通常表示今天已经签到
        const alreadyChecked =
          action?.code === 1 ||
          /please try tomorrow/i.test(message) ||
          /checkin repeats/i.test(message) ||
          /already check/i.test(message) ||
          /已经签到|今日已签到|明天再试/.test(message)

        if (
          !actionResponse.ok ||
          (action?.code !== 0 && !alreadyChecked)
        ) {
          throw new Error(
            `${new URL(origin).hostname}: ` +
            `${message || `HTTP ${actionResponse.status}`}`
          )
        }

        notice.push(
          'Checkin OK',
          `${message}`,
          `Left Days ${Number(status?.data?.leftDays)}`,
          `Host ${new URL(origin).hostname}`
        )

        success = true
        break
      } catch (error) {
        lastError = error
      }
    }

    if (!success) {
      notice.push(
        'Checkin Error',
        `${lastError || 'Unknown Error'}`,
        `<${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}>`
      )
    }
  }

  return notice
}

const notify = async (notice) => {
  if (!process.env.NOTIFY || !notice) return
  for (const option of String(process.env.NOTIFY).split('\n')) {
    if (!option) continue
    try {
      if (option.startsWith('console:')) {
        for (const line of notice) {
          console.log(line)
        }
      } else if (option.startsWith('wxpusher:')) {
        await fetch(`https://wxpusher.zjiecode.com/api/send/message`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            appToken: option.split(':')[1],
            summary: notice[0],
            content: notice.join('<br>'),
            contentType: 3,
            uids: option.split(':').slice(2),
          }),
        })
      } else if (option.startsWith('pushplus:')) {
        await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option.split(':')[1],
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      } else if (option.startsWith('bark:')) {
        await fetch(`https://api.day.app/${option.split(':')[1]}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: notice[0],
            body: notice.slice(1).join('\n'),
          }),
        })
      } else if (option.startsWith('qyweixin:')) {
        const qyweixinToken = option.split(':')[1]
        const qyweixinNotifyRebotUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + qyweixinToken;
        await fetch(qyweixinNotifyRebotUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
                content: notice.join('<br>')
            }
          }),
        })
      } else {
        // fallback
        await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option,
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      }
    } catch (error) {
      throw error
    }
  }
}

const main = async () => {
  await notify(await glados())
}

main()
