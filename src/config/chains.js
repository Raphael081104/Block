export const CHAINS = {
  eth: {
    name: "Ethereum",
    ws: "wss://ethereum-rpc.publicnode.com",
    rpcs: [
      "https://eth.llamarpc.com",
      "https://ethereum-rpc.publicnode.com",
      "https://rpc.ankr.com/eth",
    ],
    nativeDecimals: 18,
    nativeSymbol: "ETH",
    dexRouters: [
      "0x7a250d5630b4cf539739df2c5dacb4c659f2488d", // Uniswap V2
      "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3
      "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f", // SushiSwap
    ],
    stablecoins: {
      USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
      USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    },
  },
  bsc: {
    name: "BSC",
    ws: "wss://bsc-rpc.publicnode.com",
    rpcs: [
      "https://bsc-dataseed.binance.org",
      "https://bsc-dataseed1.defibit.io",
      "https://bsc.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "BNB",
    dexRouters: [
      "0x10ed43c718714eb63d5aa57b78b54704e256024e", // PancakeSwap V2
      "0x13f4ea83d0bd40e75c8222255bc855a974568dd4", // PancakeSwap V3
      "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506", // SushiSwap
    ],
    stablecoins: {
      USDT: { address: "0x55d398326f99059fF11bAC60c793979c67d6E563", decimals: 18 },
      USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    },
  },
  base: {
    name: "Base",
    ws: "wss://base-rpc.publicnode.com",
    rpcs: [
      "https://mainnet.base.org",
      "https://base.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "ETH",
    dexRouters: [
      "0x2626664c2603336e57b271c5c0b26f421741e481", // Uniswap V3
      "0x6cb442acf35158d5eda2137571e52d8a39a1969a", // Aerodrome
    ],
    stablecoins: {
      USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
    },
  },
  arbitrum: {
    name: "Arbitrum",
    ws: "wss://arbitrum-one-rpc.publicnode.com",
    rpcs: [
      "https://arb1.arbitrum.io/rpc",
      "https://arbitrum.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "ETH",
    dexRouters: [
      "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506", // SushiSwap
      "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3
    ],
    stablecoins: {
      USDT: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
      USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    },
  },
  polygon: {
    name: "Polygon",
    ws: "wss://polygon-bor-rpc.publicnode.com",
    rpcs: [
      "https://polygon-rpc.com",
      "https://polygon.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "MATIC",
    dexRouters: [
      "0xa5e0829caced8ffdd4de3c43696c57f7d7a678ff", // QuickSwap
      "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506", // SushiSwap
    ],
    stablecoins: {
      USDT: { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
      USDC: { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
    },
  },
  optimism: {
    name: "Optimism",
    ws: "wss://optimism-rpc.publicnode.com",
    rpcs: [
      "https://mainnet.optimism.io",
      "https://optimism.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "ETH",
    dexRouters: [
      "0xe592427a0aece92de3edee1f18e0157c05861564", // Uniswap V3
      "0xa062ae8a9c5e11aaa026fc2670b0d65ccc8b2858", // Velodrome
    ],
    stablecoins: {
      USDT: { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
      USDC: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
    },
  },
  avalanche: {
    name: "Avalanche",
    ws: "wss://avalanche-c-chain-rpc.publicnode.com",
    rpcs: [
      "https://api.avax.network/ext/bc/C/rpc",
      "https://avalanche-c-chain-rpc.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "AVAX",
    dexRouters: [
      "0x60ae616a2155ee3d9a68541ba4544862310933d4", // TraderJoe
      "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506", // SushiSwap
    ],
    stablecoins: {
      USDT: { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6 },
      USDC: { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6 },
    },
  },
  zksync: {
    name: "zkSync Era",
    ws: "wss://mainnet.era.zksync.io/ws",
    rpcs: [
      "https://mainnet.era.zksync.io",
      "https://zksync-era.blockpi.network/v1/rpc/public",
    ],
    nativeDecimals: 18,
    nativeSymbol: "ETH",
    dexRouters: [
      "0x2da10a1e27bf85cedd8ffb1abbe97e53391c0295", // SyncSwap
      "0x8b791913eb07c32779a16750e3868aa8495f5964", // Mute.io
    ],
    stablecoins: {
      USDC: { address: "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4", decimals: 6 },
    },
  },
  fantom: {
    name: "Fantom",
    ws: "wss://fantom-rpc.publicnode.com",
    rpcs: [
      "https://rpc.ftm.tools",
      "https://fantom.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "FTM",
    dexRouters: [
      "0xf491e7b69e4244ad4002bc14e878a34207e38c29", // SpookySwap
      "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506", // SushiSwap
    ],
    stablecoins: {
      USDT: { address: "0x049d68029688eAbF473097a2fC38ef61633A3C7A", decimals: 6 },
      USDC: { address: "0x04068DA6C83AFCFA0e13ba15A6696662335D5B75", decimals: 6 },
    },
  },
  cronos: {
    name: "Cronos",
    ws: "wss://cronos-evm-rpc.publicnode.com",
    rpcs: [
      "https://evm.cronos.org",
      "https://cronos-evm-rpc.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "CRO",
    dexRouters: [
      "0x145863eb42cf62847a6ca784e6416c1682b1b2ae", // VVS Finance
      "0xcd7d16fb918511bf7269ec4f48d61d79fb26f918", // MM Finance
    ],
    stablecoins: {
      USDT: { address: "0x66e428c3f67a68878562e79A0234c1F83c208770", decimals: 6 },
      USDC: { address: "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59", decimals: 6 },
    },
  },
  linea: {
    name: "Linea",
    ws: "wss://linea-rpc.publicnode.com",
    rpcs: [
      "https://rpc.linea.build",
      "https://linea-rpc.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "ETH",
    dexRouters: [
      "0x8cfe327cec66d1c090dd72bd0ff11d690c33a2eb", // Pancakeswap
      "0xf6b2a024550c1a07426e6eadcc42bfcc6f04b572", // Horizon
    ],
    stablecoins: {
      USDC: { address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", decimals: 6 },
    },
  },
  scroll: {
    name: "Scroll",
    ws: "wss://scroll-rpc.publicnode.com",
    rpcs: [
      "https://rpc.scroll.io",
      "https://scroll-rpc.publicnode.com",
    ],
    nativeDecimals: 18,
    nativeSymbol: "ETH",
    dexRouters: [
      "0xfc30937f5cde93df8d48acaf7e6f5d8d8a31f636", // Ambient
      "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506", // SushiSwap
    ],
    stablecoins: {
      USDC: { address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4", decimals: 6 },
    },
  },
};

export const FILTER_CONFIG = {
  minNative: 0.05,
  minStablecoins: 500,
  minTxCount: 20,
};

export const ERC20_BALANCE_OF = "0x70a08231";
export const NULL_ADDRESS = "0x" + "0".repeat(40);
