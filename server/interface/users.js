import Router from 'koa-router'
import Redis from 'koa-redis'
import nodeMailer from 'nodemailer'
import User from '../dbs/models/users'
import Passport from './utils/passport'
import Email from '../dbs/config'
import axios from './utils/axios'

const router = new Router({
  prefix: '/users'
})

const Store = new Redis().client

router.post('/signup', async(ctx) => {
  const { username, password, email, code } = ctx.request.body

  if (code) {
    // 取 redis 中的验证码和时间
    const saveCode = await Store.hget(`nodemail:${username}`, 'code')
    const saveExpire = await Store.hget(`nodemail:${username}`, 'expire')

    if (code === saveCode) {
      if (new Date().getTime() - saveExpire > 0) {
        ctx.body = {
          code: -1,
          msg: '验证码已过期，请重新尝试！'
        }
        return false
      } else {
        ctx.body = {
          code: -1,
          msg: '请填写正确的验证码！'
        }
      }
    } else {
      ctx.body = {
        code: -1,
        msg: '请填写验证码！'
      }
    }
  }

  const user = await User.find({
    username
  })

  if (user) {
    ctx.body = {
      code: -1,
      msg: '用户名已经被注册！'
    }
    return
  }

  const nuser = await User.create({
    username,
    password,
    email
  })

  if (nuser) {
    const res = await axios.post('/users/signin', {
      username,
      password
    })
    if (res.data && res.data.code === 0) {
      ctx.body = {
        code: 0,
        msg: '注册成功',
        user: res.data.user
      }
    } else {
      ctx.body = {
        code: -1,
        msg: 'error'
      }
    }
  } else {
    ctx.body = {
      code: -1,
      msg: '注册失败！'
    }
  }
})

router.post('/singin', async(ctx, next) => {
  return Passport.authenticate('local', (err, user, info, status) => {
    if (err) {
      ctx.body = {
        code: -1,
        msg: err
      }
    } else {
      if (user) {
        ctx.body = {
          code: 0,
          msg: '登录成功！',
          user
        }
        return ctx.login(user)
      } else {
        ctx.body = {
          code: 1,
          msg: info
        }
      }
    }
  })(ctx, next)
})

router.post('/verify', async(ctx, next) => {
  let { username } = ctx.request.body
  const saveExpire = await Store.hget(`nodemail:${username}`, 'expire')
  if (saveExpire && new Date().getTime() - saveExpire < 0) {
    ctx.body = {
      code: -1,
      msg: '验证请求过于频繁，一分钟内一次'
    }
    return false
  }

  let transporter  = nodeMailer.createTransport({
    host: Email.smtp.host,
    port: 587,
    secure: false,
    auth: {
      user: Email.smtp.user,
      pass: Email.smtp.pass
    }
  })

  let ko = {
    code: Email.smtp.code(),
    expire: Email.smtp.expire(),
    email: ctx.request.body.email,
    user: ctx.request.body.username
  }

  const emailOptions = {
    form: `“认证邮件” <${Email.smtp,user}>`,
    to: ko.email,
    subject: '登录注册码',
    html: `你的网站登录注册的邀请码为: ${ko.code}`
  }

  await transporter.sendMail(emailOptions, (err, info) => {
    if (err) {
      return console.log(err)
    } else {
      Store.hmset(`nodemail: ${ko.user}`, ko.code, 'expire', ko.expire, 'email', ko.email)
    }
  })
  ctx.body = {
    code: 0,
    msg: '验证码已发送，有效期一分钟'
  }
})
