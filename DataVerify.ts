import { Field, SmartContract, state, State, method, DeployArgs, Permissions, Bool, PublicKey, PrivateKey, UInt32, Provable, UInt64, AccountUpdate, UInt8, MerkleWitness, Poseidon, Struct, Circuit, Mina, MerkleTree} from 'o1js';
import crypto from 'crypto';
class MyMerkleWitness extends MerkleWitness(8) {}

class Signal extends Struct({
    source: Field,
    score: Field,
    signal: Field,
  }) {
    hash(): Field {
      return Poseidon.hash(Signal.toFields(this));
    }
  
    setSignal(points: Field) {
      return new Signal({
        source: this.source,
        score: this.score,
        signal: this.signal.add(points)
      });
    }
  }

export class DataVerify extends SmartContract {
    //合约拥有者
    @state(PublicKey) owner = State<PublicKey>();
    //阈值
    @state(Field) threshold = State<Field>();
    //根
    @state(Field) root      = State<Field>();

    async deploy(args: DeployArgs & {
        threshold: Field,
        root: Field
    }) {
        super.deploy(args);

        // 设置合约权限
        this.account.permissions.set({
            ...Permissions.default(),
            setVerificationKey: Permissions.VerificationKey.impossibleDuringCurrentVersion(),
            setPermissions: Permissions.impossible(),
        })

        this.owner.set(this.sender.getAndRequireSignature());
        this.threshold.set(args.threshold);
        this.root.set(args.root);
    }

    //更新根节点
    @method async updateRoot(newRoot: Field) {
        let originRoot = this.root.get();
        this.root.requireEquals(originRoot);

        this.root.set(newRoot);
    }


    //保存ds分析结果,验证数据来源真实性
    @method async verifySource(source: Signal, result: Signal, path: MyMerkleWitness) {
        let root = this.root.get();
        console.log("合约root:", root);

        // 直接比较 root 和 this.root.get() 的值
        const isRootEqual = root.equals(this.root.getAndRequireEquals());
        console.log("根节点是否相等:", isRootEqual);

        // 首先判断源数据摘要在树中
        path.calculateRoot(source.hash()).assertEquals(root);

        let threshold = this.threshold.getAndRequireEquals();
        
        let signal = new Field(0);

        signal = Provable.if(result.score.greaterThan(threshold), signal.add(1), signal.sub(1));
        //生成信号保存至结果
        let newResult = result.setSignal(signal);
        console.log("生成信号结果：", newResult);
        //更新结果数据至树
        let newRoot = path.calculateRoot(newResult.hash());
        console.log("newRoot:", newRoot);
        this.root.set(newRoot);
    }

}

let Local = await Mina.LocalBlockchain({ proofsEnabled: true });
Mina.setActiveInstance(Local);
let initialBalance = 10_000_000_000;

let [feePayer] = Local.testAccounts;

let contractAccount = Mina.TestPublicKey.random();

const hash = crypto.createHash('md5')
  .update('Hello')  // 输入你要哈希的字符串
  .digest('hex'); 

// this map serves as our off-chain in-memory storage
// we initialize a new Merkle Tree with height 8
const Tree = new MerkleTree(8);
const testPositive = '{"source":"AA", "twitterUrl":"https://x.com/elonmusk/status/1887277791537676598", "timestamp": "2025-01-01 10:00", "tweet": "Bitcoin price is going to the moon!"}';
const testNegative = '{"source":"BB", "twitterUrl":"https://x.com/POTUS/status/1887323482406392155", "timestamp": "2025-01-01 18:00", "tweet": "The market looks really unstable."}';
const testHold     = '{"source":"CC", "twitterUrl":"https://x.com/elonmusk/status/1887218447219585497", "timestamp": "2025-01-01 16:00", "tweet": "It is hard to predict Bitcoin future."}';

const resPositive = '{"source":"AA", "twitterUrl":"https://x.com/elonmusk/status/1887277791537676598", "timestamp": "2025-01-01 10:00", "tweet": "Bitcoin price is going to the moon!", "sentiment_score": 8}';
const resNegative = '{"source":"BB", "twitterUrl":"https://x.com/POTUS/status/1887323482406392155", "timestamp": "2025-01-01 18:00", "tweet": "The market looks really unstable.", "sentiment_score": 2}';
const resHold     = '{"source":"CC", "twitterUrl":"https://x.com/elonmusk/status/1887218447219585497", "timestamp": "2025-01-01 16:00", "tweet": "It is hard to predict Bitcoin future.", "sentiment_score": 5}';

type Texts = typeof testPositive | typeof testNegative | typeof testHold | typeof resPositive | typeof resNegative | typeof resHold;

let Signals: Map<string, Signal> = new Map<Texts, Signal>(
  [testPositive, testNegative,testHold].map((source: string, index: number) => {
    return [
      source as Texts,
      new Signal({
        source: Field('0x'+crypto.createHash('md5').update(source).digest('hex')), // `+ 1` is to avoid reusing the account aliased as `feePayer`
        score: Field(0),
        signal: Field(0)
      }),
    ];
  })
);

let Results: Map<string, Signal> = new Map<Texts, Signal>(
  [testPositive, testNegative, testHold].map((source: string) => {
    return [
      source as Texts,
      new Signal({
        source: Field('0x'+crypto.createHash('md5').update(source).digest('hex')), // `+ 1` is to avoid reusing the account aliased as `feePayer`
        score: Field(8),
        signal: Field(0),
      }),
    ];
  })
);

Tree.setLeaf(0n, Signals.get(testPositive)!.hash());
Tree.setLeaf(1n, Signals.get(testNegative)!.hash());
Tree.setLeaf(2n, Signals.get(testHold)!.hash());

// now that we got our accounts set up, we need the commitment to deploy our contract!
let initialRoot = Tree.getRoot();
console.log("initialRoot:", initialRoot);

let contract = new DataVerify(contractAccount);
console.log('Deploying DataVerify..');
if (true) {
  await DataVerify.compile();
}
let tx = await Mina.transaction(feePayer, async () => {
  AccountUpdate.fundNewAccount(feePayer).send({
    to: contractAccount,
    amount: initialBalance,
  });
  await contract.deploy({
    threshold: Field(5),
    root: initialRoot
  });
});
await tx.prove();
await tx.sign([feePayer.key, contractAccount.key]).send();

console.log('Initial points: ' + Signals.get(testPositive)?.signal);

console.log('Making verify..');
await verifySource(testPositive, 0n, Results.get(testPositive)!);

console.log('Final points: ' + Results.get(testPositive)?.signal);

async function verifySource(text: Texts, index: bigint, result: Signal) {
  let source = Signals.get(text)!;
  console.log("传参source:", source.source);
  console.log("传参result:", result.source);
  let w = Tree.getWitness(index);
  let witness = new MyMerkleWitness(w);

  let tx = await Mina.transaction(feePayer, async () => {
    await contract.verifySource(source, result, witness);
  });
  await tx.prove();
  await tx.sign([feePayer.key, contractAccount.key]).send();

  // if the transaction was successful, we can update our off-chain storage as well

  let signal = new Field(0);
  signal = Provable.if(result.score.greaterThan(contract.threshold.get()), signal.add(1), signal.sub(1));
  console.log("调用阈值:", contract.threshold.get());

  //生成信号保存至结果
  let newResult = result.setSignal(signal);
  Results.set(text, newResult);

  Tree.setLeaf(index, newResult.hash());
  contract.root.get().assertEquals(Tree.getRoot());
}
