# EVE Subdomain Deployment (EC2)

목표: `eve.asknuggetdata.com`를 기존 `ga4-qa-mvp`와 완전히 분리 배포

## 1) 분리 기준
- Code dir: `/srv/eve-event-app/current`
- Env file: `/srv/eve-event-app/.env.eve`
- DB file: `/srv/eve-event-app/data/eve.db`
- Process name: `eve-event-app` (PM2)
- Port: `3100`
- Nginx server_name: `eve.asknuggetdata.com`
- Git branch: `eve-production` (권장)

## 2) DNS
- `eve.asknuggetdata.com` A 레코드를 EC2 Public IP로 연결

## 3) EC2 초기 디렉터리
```bash
sudo mkdir -p /srv/eve-event-app/{current,data,logs}
sudo chown -R $USER:$USER /srv/eve-event-app
```

## 4) Git 분리 전략 (중요)
기존 서비스와 섞이지 않도록 eve 전용 브랜치 사용:
```bash
# 로컬/원격에서 1회
git checkout -b eve-production
git push -u origin eve-production
```

EC2 clone:
```bash
cd /srv/eve-event-app
# 이미 clone 되어 있으면 skip
git clone https://github.com/yujin-813/nugget.git current
cd current
git checkout eve-production
```

## 5) 환경변수
```bash
cp /srv/eve-event-app/current/deploy/.env.eve.example /srv/eve-event-app/.env.eve
vi /srv/eve-event-app/.env.eve
```

필수 확인:
- `DATABASE_URL=file:/srv/eve-event-app/data/eve.db`
- `PORT=3100`

## 6) PM2
```bash
npm i -g pm2
cd /srv/eve-event-app/current
pm2 start deploy/ecosystem.eve.config.cjs --only eve-event-app
pm2 save
```

## 7) Nginx
`deploy/nginx.eve.asknuggetdata.com.conf`를 적용:
```bash
sudo cp /srv/eve-event-app/current/deploy/nginx.eve.asknuggetdata.com.conf /etc/nginx/sites-available/eve.asknuggetdata.com
sudo ln -s /etc/nginx/sites-available/eve.asknuggetdata.com /etc/nginx/sites-enabled/eve.asknuggetdata.com
sudo nginx -t
sudo systemctl reload nginx
```

## 8) SSL (Certbot)
```bash
sudo certbot --nginx -d eve.asknuggetdata.com
```

## 9) 배포 실행
```bash
cd /srv/eve-event-app/current
DEPLOY_BRANCH=eve-production ./scripts/deploy-eve.sh
```

## 10) 분리 확인 체크리스트
- `pm2 status`에서 `eve-event-app` 프로세스만 3100 사용
- `nginx -T | grep eve.asknuggetdata.com` 확인
- `cat /srv/eve-event-app/.env.eve`의 DB/PORT가 ga4와 다름
- `curl -I https://eve.asknuggetdata.com`

## 롤백
```bash
cd /srv/eve-event-app/current
git checkout eve-production
git reset --hard <last-good-commit>
DEPLOY_BRANCH=eve-production ./scripts/deploy-eve.sh
```
