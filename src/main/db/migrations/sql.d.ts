// 允许以 `?raw` 后缀把 .sql 文件作为字符串导入（Vite 原生支持）。
// 迁移文件以 SQL 文本形式打包进主进程产物，避免运行时从磁盘/asar 读取路径的脆弱性。
declare module '*.sql?raw' {
  const content: string
  export default content
}
