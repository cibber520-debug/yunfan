# 云帆志愿后端容器镜像
#
# 关键点：
#   1) server/tsconfig.json 为 "noEmit": true 且 "moduleResolution": "Bundler"，
#      无法 tsc 编译后由 node 直接执行，故容器内用 tsx 直接运行 TS 入口
#      （与 package.json 的 start 脚本一致：tsx src/index.ts）。
#   2) tsx 当前是 devDependency，运行时镜像必须单独安装它（--no-save 不污染 lock）。
#   3) 容器内由 CloudBase Run 注入环境变量，无需 .env 文件（dotenv.config() 仅兜底）。

FROM node:20-alpine

ENV TZ=Asia/Shanghai
WORKDIR /app

# 1) 先装依赖（利用层缓存）
#    npm ci 仅装 lock 中的运行时依赖（express/cors/dotenv/nodemailer/pg）；
#    随后单独安装运行期必需的 tsx。
COPY package*.json ./
RUN npm ci --omit=dev \
 && npm install tsx@4.19.2 --no-save

# 2) 拷贝源码（切勿拷贝 .env / node_modules / logs / dist —— 由 .dockerignore 排除）
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./tsconfig.json

# 3) 运行期环境
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
EXPOSE 3001

# 4) 启动：先初始化数据库（建表 + 种子），再启动服务。
#    入口脚本 docker-start.sh：schema→seed→server，初始化失败亦不阻断服务启动。
#    云托管「监听端口」须设为 3001，健康检查 GET /api/v1/health
CMD ["sh", "scripts/docker-start.sh"]
