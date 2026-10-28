# Codex接入说明：60关常规机制关卡

## 目标

将本包60个新增关穿插到FlowerPuzzle原主线第64关之后。保留旧关顺序和玩法内容；只变更旧关编号与名称中的关号。沿用冰冻、砖块、机关门现有机制，不增加形状或机制代码。

## 必须先核对

1. 使用更新后的本地 `flower/FlowerPuzzle`。第64关应为「自己完成花田」，5×5、21个活跃格；若不一致，停止自动合并，重新检查旧关锚点。
2. 原主线 `level/level-*.json` 必须连续。读取 `level-catalog.json`，核对 `flower` 及其他集合。当前设计基准为500个旧关，脚本支持连续且至少235关的主线，但若数量或顺序已经变化，需要人工复核语义位置。
3. 新关文件已是最终号，不能原地复制覆盖。

## 推荐操作

在交付包根目录执行：

```bash
python3 tools/merge_mainline.py --project "/path/to/flower/FlowerPuzzle" --dry-run
python3 tools/merge_mainline.py \
  --project "/path/to/flower/FlowerPuzzle" \
  --output "/path/to/FlowerPuzzle-regular60"
```

然后把副本中的 `level/`、`level-catalog.json` 和编号映射纳入本地测试分支。脚本不会替用户提交Git，不会覆盖原工程，不会替换其他关卡集合。所有旧关的非`id`/`name`字段逐项比对保留。

合并500关基准时，预期得到560关；原1—64不变，原65→68，原235→294，新增N60→295，原236→296，原500→560。校验报告位于输出副本的 `regular60-merge-report.json`。

若失败，输出目录可能留下 `.merge-incomplete`。不要启动这种副本；排查错误后改用新的空输出路径重新执行。原目录没有被脚本改动。

## 运行时与存档接入

- 检查关卡列表、上限、解锁及下一关逻辑是否读取最新目录。当前读取的 `flower-runtime.js` 仍有 `LEVEL_LIMIT = 50`，因此不能仅因目录已变成560关，就断言这个旧播放器的进度系统能够直接覆盖560关。若产品还使用该进度实现，应改为以实际主线目录长度为上限，并专项测试；本交付包未自动修改运行时代码。
- 新关标准数据没有教程字段，不需要新增弹窗/手势教学。保持前64关已有引入流程不变。
- 若已经发版且玩家存档按数字关号记录，必须用 `mainline_number_map.json` 的 `existing.oldId→newId` 迁移“已完成集合”等数据。不要简单对所有旧编号统一加60；插入段内偏移不同。
- 迁移“最高解锁关”时先明确产品策略：把旧玩家带到原关新编号，会跳过此前新增关；让新关待补则可能造成原关前已有空缺。不要默默重置用户存档，也不要只迁移最高数值而丢失完成集合。尚未发布时可直接采用新序列。
- 对联网配表、分析事件、每日关、关卡分享码等外部编号引用做统一映射；本包不会自动改这些产品层数据。

## 数据字段说明

每关保留 `id/name/type/collection/width/height/timeLimit/activeCells/given/fences/targets/requirements/bricks/frozen/gates`。

`targets.solutionCells` 为精确覆盖参考解；`shape/assetId/variant/transform/origin` 对齐已有资源。允许旋转/镜像及无限复用，每类形状至少使用一次；不要把参考解的`requirements.count`改成运行时只能使用该数量的库存规则。

冰冻 `charges=0` 为无限；门 `circuit="single"`；同组多个门边共享一对端子。普通栅栏与预置内容均为空，避免引入用户要求之外的额外机制。

## 验收顺序

先在原编辑器导入并保存60关，再重新导出，比较活跃格、需求形状、参考解、时间及三机制字段是否保持。之后至少逐关回放附带的 `solutionTargetIndices` 顺序。

重点人工检查：第65关衔接64的负担、第95/127/159/215/247/279关砖门前置关系、第151/167/199/203/247/271/287关双门可读性、含I3的135/175/255/295关是否仍以转角拼接为主。所有包含冰冻的关都应在正确参考解下无需等冰。

错误测试：以 `validation/Nxx.json` 的 `prefixTargetIndices` 准备状态，再画 `wrongCells`；检查冰冻锁定、可先做两块其他花、解冻后删除恢复。不要把只适用于这些记录状态的证明扩大成全状态保证。

运行数据目标：先记录首次通过率、完成用时、重置次数、冰冻触发后无操作时长、门关闭引起的花块清除次数。当前没有这些实测结果，因此不要把设计分数当作通过率预测。

## 可重复执行的校验

```bash
python3 tools/audit_levels.py
node tools/replay_validate.mjs
```

Python校验只用标准库；Node回放使用交付包中的当次障碍逻辑快照。快照不含完整绘图、编辑器、账户与存档系统。仓库规则更新后应在实际新版本中再测，不能仅重复旧快照而声称兼容新规则。

`tools/build_levels.py` 是确定性构造与筛选脚本，重新运行会覆盖交付包的新关数据，不会修改原工程；日常接入无须运行它。`build_preview.py` 用现有JSON重新生成预览；`contact_sheet.py` 需要Pillow，仅用于审阅图片，不影响导入。
