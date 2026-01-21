import { NextRequest, NextResponse } from "next/server"
import { solutionPacksConfig } from "@/lib/agents/config"
import { createServerSupabaseClientForRequest } from "@/lib/supabase/server"
import { canDownloadPack, getCreditCostForPackMarkdownDownload, getDownloadPermissionMessage, normalizePlan, PLAN_LABELS } from "@/lib/pricing/rules"
import { consumeCredits, ensureTrialCreditsIfNeeded, getClientIp, hashIp } from "@/lib/pricing/profile.server"

// 瑙ｅ喅鏂规鍖呯殑璇︾粏鍐呭
const packContents: Record<string, string> = {
  "retail-marketing": `# 瀹炰綋搴楄惀閿€鍏ㄥ妗?

> 涓€绔欏紡瀹炰綋闂ㄥ簵AI钀ラ攢瑙ｅ喅鏂规锛屽寘鍚?3涓満鏅ā鍧楋紝100+鏅鸿兘浣?

## 鍦烘櫙妯″潡

### 1. 鍦烘櫙钀ラ攢
- 鑺傛棩淇冮攢鏂规鐢熸垚鍣?
- 瀛ｈ妭鎬ф椿鍔ㄧ瓥鍒掑笀
- 鏈湴鍖栬惀閿€椤鹃棶
- 鍦烘櫙鍖栭檲鍒楄璁″笀

### 2. 绮剧粏鍖栬繍钀?
- 浼氬憳鍒嗗眰杩愯惀涓撳
- 澶嶈喘鐜囨彁鍗囬【闂?
- 瀹㈠崟浠蜂紭鍖栧笀
- 搴撳瓨鍛ㄨ浆鍒嗘瀽甯?

### 3. 瀹㈡埛鏈嶅姟
- 瀹㈣瘔澶勭悊涓撳
- VIP瀹㈡埛缁存姢椤鹃棶
- 鏈嶅姟璇濇湳浼樺寲甯?
- 婊℃剰搴︽彁鍗囦笓瀹?

### 4. 鍐呭鍒涗綔
- 闂ㄥ簵鏂囨鍒涗綔甯?
- 浜у搧鎻忚堪鐢熸垚鍣?
- 淇冮攢娴锋姤鏂囨甯?
- 鏈嬪弸鍦堝唴瀹硅鍒掑笀

### 5. 鍐呭绉嶈崏
- 灏忕孩涔︾鑽夋枃妗堝笀
- 澶т紬鐐硅瘎浼樺寲甯?
- 鍙ｇ钀ラ攢绛栧垝甯?
- UGC鍐呭寮曞甯?

### 6. 鍝佺墝寤鸿
- 鍝佺墝鏁呬簨鎾板啓甯?
- 鍝佺墝璋冩€у畾浣嶅笀
- 瑙嗚璇嗗埆椤鹃棶
- 鍝佺墝浼犳挱绛栧垝甯?

### 7. 鏁版嵁鍒嗘瀽
- 閿€鍞暟鎹垎鏋愬笀
- 瀹㈡祦閲忓垎鏋愪笓瀹?
- 杞寲鐜囦紭鍖栧笀
- 绔炲搧鍒嗘瀽椤鹃棶

### 8. 鏂囨浼樺寲
- 鏍囬浼樺寲澶у笀
- 鍗栫偣鎻愮偧涓撳
- 淇冮攢鏂囨浼樺寲甯?
- A/B娴嬭瘯鍒嗘瀽甯?

### 9. 鐗硅壊鏈嶅姟
- 澧炲€兼湇鍔¤璁″笀
- 宸紓鍖栨湇鍔￠【闂?
- 鏈嶅姟娴佺▼浼樺寲甯?
- 浣撻獙鍗囩骇涓撳

### 10. 寮曟祦鑾峰
- 绾夸笂寮曟祦涓撳
- 寮備笟鍚堜綔椤鹃棶
- 鍦版帹娲诲姩绛栧垝甯?
- 鑰佸甫鏂版柟妗堣璁″笀

### 11. 钀ラ攢鎺ㄥ箍
- 娲诲姩绛栧垝涓撳
- 淇冮攢鏂规璁捐甯?
- 钀ラ攢鏃ュ巻瑙勫垝甯?
- ROI浼樺寲椤鹃棶

### 12. 杩愯惀绠＄悊
- 闂ㄥ簵SOP璁捐甯?
- 鍛樺伐鍩硅瑙勫垝甯?
- 鎺掔彮浼樺寲涓撳
- 鎴愭湰鎺у埗椤鹃棶

### 13. 鏅鸿兘宸ュ叿
- 鏅鸿兘瀹㈡湇閰嶇疆甯?
- 鑷姩鍖栬惀閿€璁捐甯?
- 鏁版嵁鐪嬫澘鎼缓甯?
- 鏁堢巼宸ュ叿鏁村悎甯?

---

## 浣跨敤璇存槑

1. 鏍规嵁鎮ㄧ殑涓氬姟闇€姹傞€夋嫨瀵瑰簲鐨勫満鏅ā鍧?
2. 澶嶅埗鐩稿叧鏅鸿兘浣撶殑鎻愮ず璇嶅埌鎮ㄧ殑AI瀵硅瘽宸ュ叿
3. 鏍规嵁鎻愮ず杈撳叆鎮ㄧ殑鍏蜂綋涓氬姟淇℃伅
4. 鑾峰彇瀹氬埗鍖栫殑钀ラ攢鏂规鍜屽唴瀹?

## 鏈€浣冲疄璺?

- 鍏堜娇鐢?鏁版嵁鍒嗘瀽"妯″潡浜嗚В鐜扮姸
- 鍐嶇敤"绮剧粏鍖栬繍钀?鍒跺畾绛栫暐
- 閰嶅悎"鍐呭鍒涗綔"浜у嚭鐗╂枡
- 閫氳繃"钀ラ攢鎺ㄥ箍"鎵ц钀藉湴

---

漏 IP瓒呯骇涓綋 - 浼氬憳涓撳睘璧勬簮
`,

  "industry-topics": `# 46琛屼笟閫夐鐢熸垚鍣?

> 瑕嗙洊46涓儹闂ㄨ涓氱殑AI閫夐鐢熸垚鍣紝甯偍蹇€熶骇鍑洪珮璐ㄩ噺鍐呭閫夐

## 琛屼笟鍒楄〃

### 浜掕仈缃戠鎶€
1. 浜哄伐鏅鸿兘/AI
2. 鐢靛晢杩愯惀
3. 鏂板獟浣撹繍钀?
4. 浜у搧缁忕悊
5. 绋嬪簭寮€鍙?

### 閲戣瀺璐㈢粡
6. 鎶曡祫鐞嗚储
7. 淇濋櫓瑙勫垝
8. 閾惰涓氬姟
9. 璐㈠姟浼氳
10. 鑲＄エ鍩洪噾

### 鏁欒偛鍩硅
11. K12鏁欒偛
12. 鑱屼笟鍩硅
13. 璇█瀛︿範
14. 鍏磋叮鏁欒偛
15. 浼佷笟鍩硅

### 鍖荤枟鍋ュ悍
16. 涓尰鍏荤敓
17. 蹇冪悊鍜ㄨ
18. 钀ュ吇鍋ュ悍
19. 鍖荤編鎶よ偆
20. 姣嶅┐鑲插効

### 鐢熸椿鏈嶅姟
21. 椁愰ギ缇庨
22. 瀹跺眳瑁呬慨
23. 鏃呮父鍑鸿
24. 濠氬簡鏈嶅姟
25. 瀹犵墿鏈嶅姟

### 鏂囧寲濞变箰
26. 褰辫濞变箰
27. 娓告垙鐢电珵
28. 闊充箰鑹烘湳
29. 浣撹偛鍋ヨ韩
30. 鎽勫奖鎽勫儚

### 鍟嗕笟鏈嶅姟
31. 娉曞緥鏈嶅姟
32. 浜哄姏璧勬簮
33. 浼佷笟绠＄悊
34. 甯傚満钀ラ攢
35. 鍝佺墝绛栧垝

### 鍒堕€犲伐涓?
36. 姹借溅琛屼笟
37. 鎴垮湴浜?
38. 寤虹瓚宸ョ▼
39. 鍒堕€犱笟
40. 鍐滀笟鍐滄潙

### 鏂板叴棰嗗煙
41. 鏂拌兘婧?
42. 璺ㄥ鐢靛晢
43. 鐩存挱甯﹁揣
44. 鐭ヨ瘑浠樿垂
45. 鍒涗笟浜虹兢
46. 楂樺噣鍊间汉缇?

---

## 浣跨敤鏂规硶

姣忎釜琛屼笟閫夐鐢熸垚鍣ㄩ兘鍖呭惈锛?
- 鐑偣杩借釜妯″潡
- 鐥涚偣鎸栨帢妯″潡
- 鐖嗘鍏紡妯″潡
- 閫夐鏃ュ巻妯″潡

鍙渶杈撳叆鎮ㄧ殑琛屼笟鍜岀洰鏍囧彈浼楋紝鍗冲彲鑾峰緱锛?
- 30涓儹闂ㄩ€夐鏂瑰悜
- 姣忎釜閫夐鐨勫垱浣滆搴?
- 棰勪及娴侀噺娼滃姏璇勫垎
- 鏈€浣冲彂甯冩椂闂村缓璁?

---

漏 IP瓒呯骇涓綋 - 浼氬憳涓撳睘璧勬簮
`,

  "cyber-ip": `# 12璧涘崥IP浜鸿妯℃澘

> 12绉嶇粡鍏歌禌鍗欼P浜鸿妯℃澘锛屽揩閫熸墦閫犵嫭鐗圭殑涓汉鍝佺墝褰㈣薄

## IP绫诲瀷涓€瑙?

### 1. 鏅烘収瀵煎笀鍨?
**瀹氫綅**锛氳涓氫笓瀹躲€佺煡璇嗗竷閬撹€?
**鐗圭偣**锛氫笓涓氭潈濞併€佹繁搴︽礊瀵熴€佸惊寰杽璇?
**閫傚悎**锛氬挩璇㈤【闂€佸煿璁甯堛€佽涓氫笓瀹?

### 2. 鐑鍒涗笟鑰呭瀷
**瀹氫綅**锛氳繛缁垱涓氳€呫€佸晢涓氬疄鎴樻淳
**鐗圭偣**锛氭縺鎯呮編婀冦€佸疄鎴樼粡楠屻€佹暍浜庡啋闄?
**閫傚悎**锛氬垱涓氳€呫€佷紒涓氬銆佸晢涓氬崥涓?

### 3. 娓╂殩闄即鍨?
**瀹氫綅**锛氱敓娲绘暀缁冦€佹儏鎰熼【闂?
**鐗圭偣**锛氫翰鍜屽姏寮恒€佸杽浜庡€惧惉銆佹俯鏆栨不鎰?
**閫傚悎**锛氬績鐞嗗挩璇€佹儏鎰熷崥涓汇€佺敓娲绘暀缁?

### 4. 鐘€鍒╃偣璇勫瀷
**瀹氫綅**锛氳涓氳瀵熻€呫€佹瘨鑸岃瘎璁哄
**鐗圭偣**锛氳鐐归矞鏄庛€佽█杈炵妧鍒┿€佷竴閽堣琛€
**閫傚悎**锛氳涓氳瘎璁恒€佹祴璇勫崥涓汇€佽鐐硅緭鍑?

### 5. 鎶€鏈瀬瀹㈠瀷
**瀹氫綅**锛氭妧鏈ぇ绁炪€佹瀬瀹㈢帺瀹?
**鐗圭偣**锛氭妧鏈繃纭€佽拷姹傛瀬鑷淬€佷箰浜庡垎浜?
**閫傚悎**锛氱▼搴忓憳銆佹妧鏈崥涓汇€佷骇鍝佹祴璇?

### 6. 鐢熸椿缇庡瀹跺瀷
**瀹氫綅**锛氬搧璐ㄧ敓娲诲€″鑰?
**鐗圭偣**锛氬缇庣嫭鐗广€佺簿鑷寸敓娲汇€佸搧鍛冲崜瓒?
**閫傚悎**锛氬灞呭崥涓汇€佹椂灏氬崥涓汇€佺敓娲绘柟寮?

### 7. 鍔卞織閫嗚鍨?
**瀹氫綅**锛氳崏鏍归€嗚鑰呫€佸姳蹇楀吀鑼?
**鐗圭偣**锛氱湡瀹炴晠浜嬨€侀€嗗鎴愰暱銆佹縺鍔变汉蹇?
**閫傚悎**锛氫釜浜烘垚闀裤€佽亴鍦哄崥涓汇€佹暀鑲插崥涓?

### 8. 骞介粯鎼炵瑧鍨?
**瀹氫綅**锛氭瀛愭墜銆佸揩涔愬埗閫犳満
**鐗圭偣**锛氬菇榛橀瓒ｃ€佽剳娲炲ぇ寮€銆佸ū涔愬ぇ浼?
**閫傚悎**锛氬ū涔愬崥涓汇€佽劚鍙ｇ銆佹悶绗戝唴瀹?

### 9. 鐞嗘€у垎鏋愬瀷
**瀹氫綅**锛氭暟鎹垎鏋愬笀銆佺悊鎬ф淳浠ｈ〃
**鐗圭偣**锛氶€昏緫娓呮櫚銆佹暟鎹┍鍔ㄣ€佸瑙備腑绔?
**閫傚悎**锛氳储缁忓崥涓汇€佺鏅崥涓汇€佸垎鏋愬笀

### 10. 鏂囪壓鎯呮€€鍨?
**瀹氫綅**锛氭枃鑹洪潚骞淬€佽瘲鎰忕敓娲诲
**鐗圭偣**锛氭枃绗斾紭缇庛€佹儏鎰熺粏鑵汇€佽瘲鎰忔氮婕?
**閫傚悎**锛氫綔瀹躲€佽瘲浜恒€佹枃鍖栧崥涓?

### 11. 琛屽姩娲惧疄骞插瀷
**瀹氫綅**锛氭墽琛屽姏鐙備汉銆佺粨鏋滃鍚戣€?
**鐗圭偣**锛氶珮鏁堟墽琛屻€佺粨鏋滆璇濄€佸姟瀹炶惤鍦?
**閫傚悎**锛氭晥鐜囧崥涓汇€佺鐞嗚€呫€佽亴鍦鸿揪浜?

### 12. 璺ㄧ晫鍒涙柊鍨?
**瀹氫綅**锛氳法鐣岃揪浜恒€佸垱鏂板厛閿?
**鐗圭偣**锛氬鍏冭儗鏅€佸垱鎰忔棤闄愩€佹暍浜庣獊鐮?
**閫傚悎**锛氭枩鏉犻潚骞淬€佸垱鎰忓伐浣滆€呫€佽法鐣屽崥涓?

---

## 浣跨敤鎸囧崡

1. **閫夋嫨鍩虹浜鸿**锛氭牴鎹偍鐨勬€ф牸鍜屽畾浣嶉€夋嫨1-2涓富瑕佷汉璁?
2. **瀹氬埗鍖栬皟鏁?*锛氱粨鍚堟偍鐨勮涓氱壒鐐硅繘琛屼釜鎬у寲璋冩暣
3. **鍐呭椋庢牸缁熶竴**锛氭墍鏈夊唴瀹逛繚鎸佷汉璁句竴鑷存€?
4. **鎸佺画杩唬浼樺寲**锛氭牴鎹矇涓濆弽棣堜笉鏂畬鍠勪汉璁?

---

漏 IP瓒呯骇涓綋 - 浼氬憳涓撳睘璧勬簮
`,

  "content-matrix": `# 鍐呭鐭╅樀瑙勫垝宸ュ叿鍖?

> 绯荤粺鍖栫殑鍐呭鐭╅樀瑙勫垝鏂规硶璁猴紝鍔╂偍鏋勫缓瀹屾暣鐨勫唴瀹圭敓鎬?

## 鍐呭鐭╅樀妗嗘灦

### 涓€銆佸唴瀹归噾瀛楀妯″瀷

\`\`\`
            /\\
           /  \\
          / 鏃楄埌 \\        (10%) 娣卞害闀挎枃銆佺郴鍒楄绋?
         /  鍐呭  \\
        /----------\\
       /   鏍稿績    \\      (30%) 涓撲笟骞茶揣銆佹渚嬭В鏋?
      /    鍐呭    \\
     /--------------\\
    /    甯歌鍐呭    \\    (60%) 鏃ュ父鏇存柊銆佷簰鍔ㄥ唴瀹?
   /------------------\\
\`\`\`

### 浜屻€?X4鍐呭鐭╅樀

| 缁村害 | 鏁欒偛浠峰€?| 濞变箰浠峰€?| 鎯呮劅浠峰€?| 瀹炵敤浠峰€?|
|------|----------|----------|----------|----------|
| 鍥炬枃 | 骞茶揣鏁欑▼ | 娈靛瓙瓒ｅ浘 | 璧板績鏁呬簨 | 娓呭崟妯℃澘 |
| 鐭棰?| 鐭ヨ瘑璁茶В | 鎼炵瑧瑙嗛 | 鎯呮劅vlog | 鏁欑▼婕旂ず |
| 鐩存挱 | 鍦ㄧ嚎璇剧▼ | 鎵嶈壓灞曠ず | 绮変笣浜掑姩 | 绛旂枒瑙ｆ儜 |
| 闀胯棰?| 娣卞害瑙ｆ瀽 | 绾綍鐗?| 浜虹墿璁胯皥 | 瀹屾暣鏁欑▼ |

### 涓夈€佸唴瀹规棩鍘嗘ā鏉?

#### 鍛ㄤ竴锛氳涓氭礊瀵?
- 琛屼笟鏂伴椈瑙ｈ
- 瓒嬪娍鍒嗘瀽棰勬祴
- 鏁版嵁鎶ュ憡瑙ｈ

#### 鍛ㄤ簩锛氬共璐у垎浜?
- 鏂规硶璁鸿緭鍑?
- 宸ュ叿鎺ㄨ崘
- 鎶€鑳芥暀瀛?

#### 鍛ㄤ笁锛氭渚嬫媶瑙?
- 鎴愬姛妗堜緥鍒嗘瀽
- 澶辫触妗堜緥澶嶇洏
- 瀵规瘮鐮旂┒

#### 鍛ㄥ洓锛氫簰鍔ㄨ瘽棰?
- 鐑偣璁ㄨ
- 闂瓟浜掑姩
- 瑙傜偣纰版挒

#### 鍛ㄤ簲锛氭晠浜嬪垎浜?
- 涓汉缁忓巻
- 鐢ㄦ埛鏁呬簨
- 琛屼笟浜虹墿

#### 鍛ㄥ叚锛氳交鏉惧唴瀹?
- 骞曞悗鑺辩诞
- 鐢熸椿鏃ュ父
- 濞变箰浜掑姩

#### 鍛ㄦ棩锛氭€荤粨瑙勫垝
- 鍛ㄥ害澶嶇洏
- 涓嬪懆棰勫憡
- 绮変笣绂忓埄

---

## 骞冲彴鍒嗗彂绛栫暐

### 涓婚樀鍦伴€夋嫨
鏍规嵁鐩爣鍙椾紬閫夋嫨1-2涓富骞冲彴娣辫€?

### 鍐呭閫傞厤鍘熷垯
- 鎶栭煶锛?5-60绉掞紝寮鸿妭濂忥紝鍓?绉掓姄鐪肩悆
- 灏忕孩涔︼細鍥炬枃涓轰富锛岀鑽夊悜锛屽疄鐢ㄦ€у己
- 瑙嗛鍙凤細2-5鍒嗛挓锛岀煡璇嗗悜锛岀鍩熻仈鍔?
- B绔欙細5-15鍒嗛挓锛屾繁搴﹀唴瀹癸紝骞磋交鍖?
- 鍏紬鍙凤細闀垮浘鏂囷紝娣卞害闃呰锛屽搧鐗屾矇娣€

### 鍙戝竷鏃堕棿鍙傝€?
- 鏃╅珮宄帮細7:00-9:00
- 鍗堜紤鏃讹細12:00-14:00
- 鏅氶珮宄帮細18:00-20:00
- 鐫″墠妗ｏ細21:00-23:00

---

## 鍐呭鐢熶骇SOP

### 1. 閫夐闃舵
- [ ] 鐑偣鐩戞帶
- [ ] 绔炲搧鍒嗘瀽
- [ ] 鐢ㄦ埛璋冪爺
- [ ] 閫夐璇勫

### 2. 鍒涗綔闃舵
- [ ] 澶х翰璁捐
- [ ] 绱犳潗鏀堕泦
- [ ] 鍐呭鎾板啓
- [ ] 瑙嗚璁捐

### 3. 鍙戝竷闃舵
- [ ] 璐ㄩ噺瀹℃牳
- [ ] 鏍囬浼樺寲
- [ ] 鏍囩璁剧疆
- [ ] 瀹氭椂鍙戝竷

### 4. 杩愯惀闃舵
- [ ] 浜掑姩鍥炲
- [ ] 鏁版嵁鐩戞帶
- [ ] 鏁堟灉澶嶇洏
- [ ] 杩唬浼樺寲

---

漏 IP瓒呯骇涓綋 - 浼氬憳涓撳睘璧勬簮
`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> }
) {
  try {
    const { packId } = await params

  const supabase = await createServerSupabaseClientForRequest(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "????" }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan, credits_balance, credits_unlimited, trial_granted_at")
    .eq("id", user.id)
    .single()

  let userProfile = profile
  if (profileError || !profile) {
    if (profileError?.code === "PGRST116") {
      const { data: created, error: createError } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email,
          nickname: user.email?.split("@")[0] || "User",
          plan: "free",
          credits_balance: 30,
          credits_unlimited: false,
        })
        .select("plan, credits_balance, credits_unlimited, trial_granted_at")
        .single()

      if (createError || !created) {
        return NextResponse.json({ error: createError?.message || "profile create failed" }, { status: 500 })
      }
      userProfile = created
    } else {
      return NextResponse.json({ error: profileError?.message || "profile not found" }, { status: 500 })
    }
  }

  const currentPlan = normalizePlan(userProfile?.plan)
  let creditsBalance = Number(userProfile?.credits_balance || 0)
  const creditsUnlimited = Boolean(userProfile?.credits_unlimited) || currentPlan === "vip"

  // 妫€鏌ヤ笅杞芥潈闄?
  if (!canDownloadPack(packId, currentPlan)) {
    const message = getDownloadPermissionMessage(packId, currentPlan)
    return NextResponse.json(
      {
        error: message || "此资源需要更高级别会员才能下载",
        code: "download_forbidden",
        current_plan: currentPlan,
        current_plan_label: PLAN_LABELS[currentPlan],
      },
      { status: 403 }
    )
  }

  const cost = getCreditCostForPackMarkdownDownload(packId, currentPlan)

  if (!creditsUnlimited && cost > 0) {
    const deviceId = request.headers.get("x-device-id") || ""
    const ip = getClientIp(request)
    const ipHash = ip ? hashIp(ip) : null

    if (!userProfile?.trial_granted_at && creditsBalance <= 0 && deviceId.trim().length >= 8) {
      const updated = await ensureTrialCreditsIfNeeded({
        supabase,
        userId: user.id,
        profile: {
          plan: currentPlan,
          credits_balance: creditsBalance,
          credits_unlimited: creditsUnlimited,
          trial_granted_at: (userProfile?.trial_granted_at as string | null) ?? null,
        },
        deviceId,
        ipHash,
      })
      creditsBalance = updated.credits_balance
    }

    const consumed = await consumeCredits({
      supabase,
      userId: user.id,
      currentBalance: creditsBalance,
      amount: cost,
      stepId: `download:pack_markdown:${packId}`,
    })
    creditsBalance = consumed.credits_balance
  }

  // Find solution pack config
  const pack = solutionPacksConfig.find((p) => p.id === packId)

  if (!pack) {
    return NextResponse.json(
      { error: "Solution pack not found" },
      { status: 404 }
    )
  }

  // Load pack content
  const content = packContents[packId]

  if (!content) {
    return NextResponse.json(
      { error: "Pack content missing" },
      { status: 404 }
    )
  }

  // Generate file name
  const fileName = `${pack.title}.md`

    // 鍒涘缓鍝嶅簲锛岃缃负涓嬭浇鏂囦欢
    const response = new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "no-cache",
        "X-Credits-Cost": String(cost),
        "X-Credits-Remaining": creditsUnlimited ? "inf" : String(creditsBalance)
      }
    })

    return response
  } catch (error) {
    if (error instanceof Error && error.message === "insufficient_credits") {
      const meta = (error as unknown as { meta?: { required?: number; balance?: number } }).meta
      return NextResponse.json(
        {
          error: `Insufficient credits: required ${meta?.required ?? 0}, remaining ${meta?.balance ?? 0}.`,
          code: "insufficient_credits",
          required: meta?.required ?? 0,
          balance: meta?.balance ?? 0,
        },
        { status: 402 }
      )
    }

    console.error("Download error:", error)
    return NextResponse.json({ error: "Download failed." }, { status: 500 })
  }
}



