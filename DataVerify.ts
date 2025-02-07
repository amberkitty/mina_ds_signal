import { Field, SmartContract, state, State, method, DeployArgs, Permissions, Bool, PublicKey, PrivateKey, UInt32, Provable, UInt64, AccountUpdate, UInt8, MerkleWitness, Poseidon, Struct, Circuit} from 'o1js';

class MyMerkleWitness extends MerkleWitness(8) {}

class Signal extends Struct({
    source: Field,
    score: UInt8,
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
    @state(UInt8) threshold = State<UInt8>();
    //根
    @state(Field) root      = State<Field>();

    async deploy(args: DeployArgs & {
        owner: PublicKey,
        threshold: UInt8,
        root: Field
    }) {
        super.deploy(args);

        // 设置合约权限
        this.account.permissions.set({
            ...Permissions.default(),
            setVerificationKey: Permissions.VerificationKey.impossibleDuringCurrentVersion(),
            setPermissions: Permissions.impossible(),
        })

        this.owner.set(args.owner);
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
        this.root.requireEquals(root);

        //首先判断源数据摘要在树中
        path.calculateRoot(Poseidon.hash([source.hash()])).assertEquals(root);

        
        let threshold = this.threshold.getAndRequireEquals();
        
        let signal = new Field(0);

        Provable.if(result.score.greaterThan(this.threshold.getAndRequireEquals()), signal.add(1), signal.div(1));
        //生成信号保存至结果
        let newResult = result.setSignal(signal);
        //更新结果数据至树
        let newRoot = path.calculateRoot(Poseidon.hash([newResult.hash()]));
        this.root.set(newRoot);
    }

}