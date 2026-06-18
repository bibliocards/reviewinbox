import { loadServerConfig } from "@reviewinbox/config"
import { createDatabase } from "@reviewinbox/db"

const config = loadServerConfig()

export const database = createDatabase(config.databaseUrl)
export { config as serverConfig }
