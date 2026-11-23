import { createHash } from 'node:crypto';
import { mcqBankContent, importBankQuestion } from '../../assessment/policy.ts';
import { canPublish, documentSchema } from '../../authoring/policy.ts';
import {
  alertmanagerConfig, composeFile, datasourceConfig, prometheusConfig, prometheusRules, sampleMetrics,
  startCommands, targetsQuery, trafficCommand, validateRulesCommands,
} from './lab-kit.ts';

export const courseSlug = 'prometheus-grafana';

type Text = { en: string; ar: string };
type Block = { type: 'paragraph' | 'heading' | 'callout' | 'code'; translations: Text };
const text = (en: string, ar: string): Text => ({ en, ar });
const prose = (en: string, ar: string): Block => ({ type: 'paragraph', translations: text(en, ar) });
const note = (en: string, ar: string): Block => ({ type: 'callout', translations: text(en, ar) });
const heading = (en: string, ar: string): Block => ({ type: 'heading', translations: text(en, ar) });
const code = (snippet: string): Block => ({ type: 'code', translations: text(snippet, snippet) });

// These keys are persistent content identifiers. Keep them when revising copy or reordering lessons.
function id(key: string) {
  const value = createHash('sha256').update(`${courseSlug}/${key}`).digest('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-8${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function lesson(key: string, titles: Text, ...blocks: Block[]) {
  return { id: id(`lesson/${key}`), titles, blocks: blocks.map((block, index) => ({
    id: id(`lesson/${key}/block/${index + 1}`), ...block,
  })) };
}

const errorRatio = `sum(rate(demo_requests_total{status=~"5.."}[2m]))
/
sum(rate(demo_requests_total[2m]))`;
const p95 = `histogram_quantile(0.95,
  sum by (le) (demo_request_duration_seconds_bucket)
)`;
const alertQuery = 'up{job="sample"} == 0';

const modules = [
  { id: id('module/observe'), titles: text('Observability Foundations', 'أساسيات قابلية الرصد'), lessons: [
    lesson('signals', text('Choose a Signal', 'اختيار إشارة الرصد'),
      prose('Start with a question you can act on. If visitors report a slow service, use metrics to find when latency changed, logs to inspect errors, and traces to see where a request spent its time.',
        'ابدأ بسؤال تقود إجابته إلى إجراء. إذا اشتكى الزوار من بطء الخدمة، استخدم المقاييس لتحديد وقت ارتفاع زمن الاستجابة، والسجلات لفحص الأخطاء، والتتبّع لمعرفة أين قضى الطلب وقته.'),
      prose('For a request-driven service, use RED to measure request rate, errors, and duration. For a resource, use USE to measure utilization, saturation, and errors. Start with one service, its owner, and a symptom that deserves investigation.',
        'في الخدمات التي تستقبل الطلبات، استخدم منهج RED لقياس المعدّل والأخطاء والمدة. وفي الموارد، استخدم منهج USE لقياس الاستخدام والتشبّع والأخطاء. ابدأ بخدمة واحدة وحدّد المسؤول عنها والعَرَض الذي يستدعي التحقيق.'),
      note('In the capstone, you will connect collection, queries, a dashboard, and a recovery drill in a disposable environment you control.',
        'في المشروع الختامي ستربط جمع المقاييس والاستعلامات ولوحة المعلومات وتمرين الاستعادة داخل بيئة تدريب مؤقتة تتحكّم فيها.')),
    lesson('series', text('Read Metrics and Labels', 'قراءة المقاييس والوسوم'),
      prose('Prometheus periodically scrapes an HTTP endpoint, attaches target labels such as job and instance, and stores timestamped samples. A metric name and its full label set identify one time series. A target can be reachable while its service is unhealthy.',
        'يجلب Prometheus عينات دوريًا من نقطة HTTP، ويضيف وسوم الهدف مثل job وinstance، ثم يخزّن العينات مع أوقاتها. يحدّد اسم المقياس ومجموعة وسومه الكاملة سلسلة زمنية واحدة. قد يكون الهدف قابلًا للوصول مع وجود خلل في خدمته.'),
      code('demo_requests_total{method="GET",status="500"} 20'),
      prose('A counter accumulates and can reset on restart. A gauge can rise or fall. A classic histogram exposes cumulative buckets, a sum, and a count. A summary can calculate quantiles in the instrumented process. Keep labels bounded, for example status class or route template. Every distinct user ID would create more series.',
        'يتراكم العدّاد وقد يُصفّر عند إعادة التشغيل. ويمكن للمقياس اللحظي أن يرتفع أو ينخفض. يعرض المدرّج التكراري التقليدي دلاء تراكمية ومجموعًا وعددًا. ويمكن للمقياس الملخّص حساب القيم المئينية داخل العملية نفسها. استخدم وسومًا محدودة القيم مثل فئة الحالة أو قالب المسار. يضيف كل معرّف مستخدم مختلف سلاسل جديدة.')),
  ] },
  { id: id('module/collect'), titles: text('Collection and Local Setup', 'جمع المقاييس وإعداد البيئة المحلية'), lessons: [
    lesson('compose', text('Prepare the Practice Stack', 'إعداد حزمة التدريب'),
      prose('Use a disposable Linux environment you control with Docker Compose, curl, and OpenSSL. Make a new practice directory containing compose.yaml, prometheus.yml, rules.yml, datasource.yml, alertmanager.yml, and the sample/metrics file. Create the sample directory first. Copy each named block from this lesson and the next.',
        'استخدم بيئة لينكس مؤقتة تتحكّم فيها وتتوفّر فيها Docker Compose وcurl وOpenSSL. أنشئ مجلد تدريب جديدًا يضم compose.yaml وprometheus.yml وrules.yml وdatasource.yml وalertmanager.yml وملف sample/metrics. انسخ كل مقتطف في هذا الدرس والتالي إلى الملف المحدّد، وأنشئ مجلد sample أولًا.'),
      heading('Compose File and Prometheus Configuration', 'ملف Compose وإعدادات Prometheus'),
      code(composeFile), code(prometheusConfig),
      prose('Save the following block as sample/metrics. The sample service exposes fixed teaching data so you can predict its values. Choose a different free loopback port in the Compose file and adjust the examples if a port is taken.',
        'احفظ المقتطف التالي في sample/metrics. تعرض الخدمة التجريبية بيانات تدريب ثابتة كي تستطيع توقّع قيمها. إذا كان منفذ محلي مستخدمًا، اختر منفذًا متاحًا في ملف Compose وعدّل الأمثلة تبعًا لذلك.'),
      code(sampleMetrics)),
    lesson('targets', text('Verify Scrapes and Exporters', 'التحقّق من جلب المقاييس والمصدّرات'),
      prose('Save the next three blocks as datasource.yml, rules.yml, and alertmanager.yml, in that order. The Prometheus data source uses the Docker service name because Grafana queries it from inside its container. The Alertmanager receiver has no external destination.',
        'احفظ المقتطفات الثلاثة التالية بالترتيب في datasource.yml وrules.yml وalertmanager.yml. يستخدم مصدر بيانات Prometheus اسم خدمة Docker لأن Grafana يستعلم عنه من داخل حاويته. لا يرسل مستقبِل Alertmanager التدريبي إلى وجهة خارجية.'),
      code(datasourceConfig), code(prometheusRules), code(alertmanagerConfig),
      prose('Run the startup commands in your practice directory. Keep the generated Grafana password locally and re-export the same value in a new terminal if you reuse the Grafana volume. Retry the readiness requests after startup. Query up in Prometheus at http://127.0.0.1:19090 and wait for both jobs to report 1. Inspect any scrape error in the Targets view.',
        'نفّذ أوامر التشغيل داخل مجلد التدريب. احتفظ بكلمة مرور Grafana المولّدة محليًا وصدّر القيمة نفسها عند استخدام طرفية جديدة مع وحدة تخزين Grafana نفسها. أعد طلبات الجاهزية بعد الإقلاع. استعلم عن up في Prometheus على العنوان http://127.0.0.1:19090 وانتظر حتى يعرض كلا الهدفين القيمة 1. افحص أي خطأ في جلب المقاييس من صفحة الأهداف.'),
      code(startCommands), code(targetsQuery),
      prose('An exporter translates another system into Prometheus metrics. Use node_exporter for Linux host metrics or Blackbox Exporter for an HTTP or TLS probe. For recurring jobs, prefer a last-success timestamp with bounded labels. The sample endpoint in this lab gives you a predictable scrape target without host mounts.',
        'يحوّل المصدّر بيانات نظام آخر إلى مقاييس يفهمها Prometheus. استخدم node_exporter لمقاييس مضيف لينكس، أو Blackbox Exporter لفحص HTTP أو TLS. للمهام الدورية استخدم وقت آخر نجاح مع وسوم محدودة. توفّر نقطة التدريب هدفًا متوقّعًا دون ربط مجلدات النظام المضيف.')),
  ] },
  { id: id('module/query'), titles: text('PromQL Essentials', 'أساسيات PromQL'), lessons: [
    lesson('selectors', text('Select and Inspect Time Series', 'اختيار السلاسل الزمنية وفحصها'),
      prose('Start with the metric name. Look at the real labels before filtering. The first expression is an instant vector with one value per matching series at the evaluation time. The second selects samples over two minutes as a range vector. The third returns matching series from targets whose last scrape failed.',
        'ابدأ باسم المقياس وافحص الوسوم الفعلية قبل التصفية. يعيد التعبير الأول متجهًا لحظيًا يحوي قيمة لكل سلسلة مطابقة عند وقت التقييم. يختار الثاني عينات من دقيقتين كمتجه نطاقي. ويعيد الثالث السلاسل المطابقة للأهداف التي فشل آخر جلب لها.'),
      code(`demo_requests_total{status=~"5.."}
demo_requests_total{status="200"}[2m]
up == 0`),
      prose('Run each expression separately. Inspect the range-vector selector in the table. To graph repeated evaluations over time, use an instant-vector expression such as the first query. A comparison filters by default. An empty result can mean no matching labels or missing samples, so investigate before interpreting it as recovery.',
        'نفّذ كل تعبير على حدة. افحص محدّد المتجه النطاقي في الجدول. ولرسم تقييمات متكررة عبر الزمن استخدم تعبيرًا بمتجه لحظي مثل الاستعلام الأول. تصفّي المقارنة النتائج افتراضيًا. قد تنتج القائمة الفارغة عن غياب الوسوم المطابقة أو العينات، لذا تحرَّ السبب قبل اعتبارها تعافيًا.')),
    lesson('rates', text('Measure Rates and Aggregate', 'حساب المعدّلات وتجميعها'),
      prose('Use rate on counters to estimate change per second and increase to estimate total change over a window. Prometheus accounts for counter resets. Apply rate before aggregating so each series keeps its own reset history. A two-minute window covers eight 15-second scrape intervals.',
        'استخدم rate مع العدّادات لتقدير التغيّر في الثانية، وincrease لتقدير إجمالي التغيّر خلال نافذة. يراعي Prometheus تصفير العدّادات. طبّق rate قبل التجميع حتى تُحسب إعادة ضبط كل سلسلة على حدة. تغطي نافذة الدقيقتين ثماني فترات جلب طول كل منها 15 ثانية.'),
      code(trafficCommand),
      code(`sum by (job) (rate(prometheus_http_requests_total[2m]))
increase(prometheus_http_requests_total[2m])
avg_over_time(demo_queue_depth[2m])`),
      note('Wait for at least two scrapes and generate a little local query traffic. Each line is a separate query. Use the last expression for the gauge. The sample counters stay flat by design, while Prometheus counts its own live requests.',
        'انتظر عمليتَي جلب على الأقل وأرسل بعض الاستعلامات المحلية. كل سطر استعلام مستقل. استخدم التعبير الأخير للمقياس اللحظي. تبقى عدّادات العينة ثابتة عمدًا، بينما يسجّل Prometheus طلباته الفعلية.')),
  ] },
  { id: id('module/interpret'), titles: text('PromQL for Service Health', 'استخدام PromQL لقياس صحّة الخدمة'), lessons: [
    lesson('error-ratio', text('Calculate an Error Ratio', 'حساب نسبة الأخطاء'),
      prose('For a live service with these metric names, divide the rate of failed requests by the rate of all requests. Keep the denominator scoped to the same service and time window. Treat a zero denominator as no traffic. If you group by service, retain the same grouping on both sides so PromQL can match the vectors.',
        'في خدمة فعلية تستخدم أسماء المقاييس هذه، اقسم معدّل الطلبات الفاشلة على معدّل الطلبات كلّها. استخدم الخدمة والنافذة الزمنية نفسهما في المقام. يعني المقام الصفري غياب الطلبات. وعند التجميع بحسب الخدمة، احتفظ بمفاتيح التجميع نفسها في الطرفين كي يستطيع PromQL مطابقة المتجهات.'),
      code(errorRatio),
      prose('The static sample has no rate after it stabilizes. To practice the arithmetic on the fixed fixture, use cumulative counts and expect 0.1. Treat this alternate expression as a lifetime ratio for the fixture. Choose a percent unit in Grafana that expects fractions from 0 to 1.',
        'لا يتغيّر العدّاد الثابت مع مرور الوقت. للتدرّب على الحساب باستخدام العينة الثابتة، استخدم العدّادات التراكمية وتوقّع 0.1. يمثّل التعبير البديل نسبة منذ بدء العدّ في العينة. اختر في Grafana وحدة النسبة المئوية التي تستقبل قيمًا من 0 إلى 1.'),
      code(`sum(demo_requests_total{status=~"5.."}) / sum(demo_requests_total)`)),
    lesson('latency', text('Estimate Latency and Record a Query', 'تقدير زمن الاستجابة وتسجيل استعلام'),
      prose('For a classic histogram, retain the le label when summing buckets and use histogram_quantile to estimate p95. On a live service use rate over each bucket first. The following expression reads the cumulative practice fixture and estimates p95 near 0.69 seconds. Bucket width limits precision.',
        'في المدرّج التكراري التقليدي احتفظ بوسم le عند تجميع الدلاء، ثم استخدم histogram_quantile لتقدير المئين 95. في الخدمة الفعلية احسب rate لكل دلو أولًا. يقرأ التعبير التالي عينة التدريب التراكمية ويتوقّع تقديرًا يقارب 0.69 ثانية. ويتأثر مدى الدقة بعرض الدلو.'),
      code(p95),
      prose('The practice rules file already records a two-minute request rate by job. Compare the recorded metric with its original expression after a few evaluation cycles. Use a recording rule when an expensive, shared expression is reused. To count targets missing entirely, check presence explicitly.',
        'يسجّل ملف قواعد التدريب معدّل الطلبات خلال دقيقتين بحسب المهمة. قارن المقياس المسجّل بالتعبير الأصلي بعد دورات تقييم عدّة. استخدم قاعدة تسجيل عندما يُعاد استخدام تعبير مكلف ومشترك. ولرصد غياب الأهداف بالكامل، اختبر وجودها صراحةً.'),
      code(`job:prometheus_http_requests:rate2m
absent(up{job="sample"})`)),
  ] },
  { id: id('module/visualize'), titles: text('Grafana Explore and Dashboards', 'الاستكشاف ولوحات المعلومات في Grafana'), lessons: [
    lesson('explore', text('Inspect the Prometheus Data Source', 'فحص مصدر بيانات Prometheus'),
      prose('Open Grafana at http://127.0.0.1:13000. Sign in as admin with the practice password you generated locally. Keep that value in your local environment or password manager. In Explore select Practice Prometheus and run the same expression and time range you verified in Prometheus.',
        'افتح Grafana على العنوان http://127.0.0.1:13000. سجّل الدخول باسم admin وبكلمة مرور التدريب التي ولّدتها محليًا. احتفظ بها في بيئتك المحلية أو مدير كلمات المرور. في Explore اختر مصدر Practice Prometheus وطبّق التعبير والمدى الزمني اللذين تحقّقت منهما في Prometheus.'),
      code('up{job="sample"}'),
      prose('Use an instant query to inspect the latest target value and a range query to see how it changes. Provisioning gives the data source a stable UID so panels keep their reference when you recreate the practice environment.',
        'استخدم استعلامًا لحظيًا لقراءة أحدث قيمة للهدف واستعلام نطاق لرصد تغيّرها. يمنح الإعداد المسبق مصدر البيانات معرّفًا ثابتًا لتظل اللوحات مرتبطة به عند إعادة إنشاء بيئة التدريب.')),
    lesson('dashboard', text('Build a Service Dashboard', 'إنشاء لوحة معلومات للخدمة'),
      prose('Create a dashboard called Practice Service Health. Add a Stat panel for the current sample scrape, map 1 to Up and 0 to Down, and use a Time series panel for the recorded request rate. Name panels after the question they answer and label the rate in requests per second.',
        'أنشئ لوحة باسم Practice Service Health. أضف لوحة إحصائية لآخر جلب للهدف التجريبي واعرض القيمة 1 على أنها متاح والقيمة 0 على أنها متوقّف. وأضف لوحة سلسلة زمنية لمعدّل الطلبات المسجّل. سمِّ كل لوحة بحسب السؤال الذي تجيب عنه واذكر أن وحدة المعدّل هي طلبات في الثانية.'),
      code(`up{job="sample"}
job:prometheus_http_requests:rate2m`),
      prose('Add a job variable from the Prometheus label values if you want a reusable dashboard. With multi-select enabled, use a regex label matcher. Check both jobs, keep the initial time range short, and export the dashboard JSON without secret data for version control.',
        'أضف متغيّرًا للمهمة من قيم وسوم Prometheus لجعل اللوحة قابلة لإعادة الاستخدام. استخدم مطابقة بالتعبير النمطي عند تفعيل الاختيار المتعدّد. افحص كلا الهدفين وابدأ بمدى زمني قصير، ثم صدّر ملف JSON الخاص باللوحة دون بيانات سرّية لحفظه في نظام إدارة الإصدارات.'),
      code('up{job=~"$job"}')),
  ] },
  { id: id('module/alert'), titles: text('Alert Rules and Delivery', 'قواعد التنبيه وتسليم الإشعارات'), lessons: [
    lesson('rule-lifecycle', text('Observe Pending, Firing, and Recovery', 'مراقبة انتظار التنبيه وانطلاقه والتعافي'),
      prose('The SampleTargetDown rule matches failed scrapes. Its condition must persist for 45 seconds before it fires. Alertmanager groups by alert name and job and waits briefly before handling a new group. The practice receiver lets you inspect the alert in Alertmanager without sending a message.',
        'تطابق قاعدة SampleTargetDown عمليات الجلب الفاشلة. يجب أن يستمر الشرط 45 ثانية حتى ينطلق التنبيه. يجمّع Alertmanager التنبيهات بحسب الاسم والمهمة وينتظر قليلًا قبل معالجة المجموعة الجديدة. يتيح المستقبِل التدريبي فحص التنبيه في Alertmanager من دون إرسال رسالة.'),
      code(validateRulesCommands),
      code(`docker compose stop sample
curl -fsS http://127.0.0.1:19090/api/v1/alerts
curl -fsS http://127.0.0.1:19093/api/v2/alerts
docker compose start sample`),
      prose('Stop just the sample service. Run the two checks repeatedly and record the transition from pending to firing before starting the service again. Confirm that up returns to 1 and the alert clears. For a real receiver, include owner, severity, evidence to inspect, and a runbook with a concrete first action.',
        'أوقف الخدمة التجريبية فقط. أعد الفحصين وسجّل الانتقال من قيد الانتظار إلى الانطلاق قبل تشغيل الخدمة مجددًا. تحقّق من عودة up إلى 1 وزوال التنبيه. عند إعداد جهة تلقٍّ فعلية، أضف المسؤول ودرجة الخطورة وما يجب فحصه ودليل تشغيل يحدّد الإجراء الأول.')),
    lesson('grafana-alerts', text('Diagnose Grafana No Data and Error', 'تشخيص غياب البيانات وأخطاء Grafana'),
      prose('Grafana-managed alert rules add explicit No Data and Error policies. No Data means a successful evaluation found no data points. Error means the evaluation failed, for example a timeout. A returned value of 0 is still data. Use a separate practice rule with no live contact point to inspect each policy.',
        'تضيف قواعد التنبيه التي يديرها Grafana سياستين واضحتين لغياب البيانات وفشل التقييم. غياب البيانات يعني أن التقييم نجح ولم يعثر على نقاط بيانات. أما الخطأ فيعني فشل التقييم، مثل انتهاء المهلة. وتظل القيمة 0 نتيجة موجودة. استخدم قاعدة تدريب منفصلة دون جهة اتصال فعلية لفحص كل سياسة.'),
      code(`up{job="sample"}
up{job="never-configured"}
absent(up{job="sample"})`),
      prose('Run the first two expressions separately using the same data source and range in Explore. If only the second is empty, inspect the actual labels. If both queries fail, check data source connectivity. When expected telemetry disappears, consider an explicit absence rule. Verify the notification policy and contact point independently of the query.',
        'نفّذ التعبيرين الأول والثاني منفصلين باستخدام المصدر والمدى نفسيهما في Explore. إذا كان الثاني وحده فارغًا فافحص الوسوم الفعلية. وإذا فشل الاستعلامان فتحقّق من اتصال مصدر البيانات. عند اختفاء قياسات متوقّعة، فكّر في قاعدة صريحة لرصد الغياب. وتحقّق من سياسة الإشعارات وجهة الاتصال بصورة مستقلة عن الاستعلام.')),
  ] },
  { id: id('module/operate'), titles: text('Operations and Capstone', 'التشغيل والمشروع الختامي'), lessons: [
    lesson('troubleshooting', text('Troubleshoot and Plan for Production', 'تشخيص الأعطال والتخطيط للإنتاج'),
      prose('When a graph is empty, start with the target and its scrape error. Check the raw metric and actual labels, then the time window, query, and data source. For an alert, then inspect evaluation state, routing, and delivery. Compare a host problem using USE signals with a service problem using RED signals.',
        'عند ظهور رسم فارغ، ابدأ بالهدف وخطأ الجلب. افحص المقياس الخام والوسوم الفعلية، ثم المدى الزمني والاستعلام ومصدر البيانات. وإذا كان العطل في تنبيه، افحص بعدها حالة التقييم والتوجيه والتسليم. قارن تشخيص مشكلة في مضيف بإشارات USE مع تشخيص خدمة بإشارات RED.'),
      code(`curl -fsS http://127.0.0.1:19090/api/v1/targets
curl -fsS http://127.0.0.1:19090/api/v1/rules
docker compose logs --tail=50 prometheus grafana alertmanager`),
      prose('For production, restrict access to metrics, use authenticated TLS at the appropriate boundary, and store secrets outside configuration history. Measure series count and disk growth before choosing retention. Version dashboards and rules, rehearse restoration, and monitor monitoring from an independent system before designing high availability.',
        'في الإنتاج قيّد الوصول إلى المقاييس واستخدم TLS مع التحقّق من الهوية عند نقطة الوصول المناسبة واحفظ الأسرار خارج سجل الإعدادات. قِس عدد السلاسل ونمو مساحة القرص قبل تحديد الاحتفاظ. احفظ إصدارات اللوحات والقواعد وجرّب الاستعادة وراقب منظومة الرصد بأداة مستقلة قبل تصميم التوفّر العالي.')),
    lesson('capstone', text('Run the End-to-End Recovery Drill', 'تنفيذ تمرين الاستعادة الشامل'),
      prose('Name the service, expected normal behavior, and its owner. In your practice environment, verify scrapes, compare the raw series with a derived query, and save the Grafana dashboard. Stop only the sample service, record when the panel and alert change, and then restore the service and confirm recovery.',
        'حدّد اسم الخدمة وسلوكها الطبيعي المتوقع والمسؤول عنها. في بيئتك التدريبية تحقّق من الجلب وقارن السلسلة الخام باستعلام مشتق، ثم احفظ لوحة Grafana. أوقف خدمة العينة فقط وسجّل وقت تغيّر اللوحة والتنبيه. أعد تشغيل الخدمة وتحقّق من التعافي.'),
      note('Submit your own observations in the capstone Guided Lab. If you share evidence, include a short timeline, a query, and a recovery result. Keep credentials and internal identifiers in your practice environment.',
        'أرسل ملاحظاتك في المختبر الموجّه الختامي. إذا أرفقت دليلًا، اذكر تسلسلًا زمنيًا قصيرًا واستعلامًا ونتيجة التعافي. احتفظ ببيانات الاعتماد والمعرّفات الداخلية داخل بيئة التدريب.'),
      prose('When finished, export any practice work you want to retain. Run the command in the same practice directory to stop the project while keeping its named data volumes.',
        'عند الانتهاء صدّر أعمال التدريب التي ترغب في الاحتفاظ بها. نفّذ الأمر من مجلد التدريب نفسه لإيقاف المشروع مع الإبقاء على وحدات تخزينه المسماة.'),
      code('docker compose down')),
  ] },
];

function question(key: string, tag: string, content: {
  prompt: Text; choices: Text[]; correct: number; explanation: Text;
}) {
  const { prompt, choices, correct, explanation } = content;
  return {
    id: id(`bank/${key}`), version: 1, archived: false,
    ...mcqBankContent.parse({
      tags: ['prometheus-grafana', tag], correct,
      translations: {
        en: { prompt: prompt.en, choices: choices.map((choice) => choice.en), explanation: explanation.en },
        ar: { prompt: prompt.ar, choices: choices.map((choice) => choice.ar), explanation: explanation.ar },
      },
    }),
  };
}

const assessments = [
  { key: 'collection', titles: text('Collection Check', 'اختبار جمع المقاييس'), questions: [
    question('series-key', 'collection', {
      prompt: text('What identifies a Prometheus time series?', 'ما الذي يحدّد السلسلة الزمنية في Prometheus؟'),
      choices: [text('The last sample value', 'قيمة آخر عينة'), text('The metric name and full label set', 'اسم المقياس ومجموعة وسومه الكاملة'), text('The dashboard panel title', 'عنوان لوحة العرض')],
      correct: 1,
      explanation: text('Changing even one label value creates a distinct series.', 'يؤدي تغيير قيمة وسم واحد إلى إنشاء سلسلة مستقلة.'),
    }),
    question('scrape-success', 'collection', {
      prompt: text('What does up = 1 establish for a target?', 'ما الذي تثبته القيمة up = 1 لهدف ما؟'),
      choices: [text('Prometheus scraped the target successfully', 'نجح Prometheus في جلب المقاييس من الهدف'), text('Every feature of the monitored service works', 'تعمل كل وظائف الخدمة المراقبة'), text('Grafana delivered a notification', 'أرسل Grafana إشعارًا')],
      correct: 0,
      explanation: text('The up metric reflects scrape success for that target.', 'يعكس المقياس up نجاح جلب المقاييس من ذلك الهدف.'),
    }),
    question('bounded-labels', 'collection', {
      prompt: text('Which label value is suitable for controlling cardinality?', 'أي قيمة وسم تساعد على ضبط عدد السلاسل؟'),
      choices: [text('A full request UUID', 'معرّف UUID الكامل للطلب'), text('A user email address', 'بريد المستخدم الإلكتروني'), text('A bounded route template', 'قالب مسار محدود القيم')],
      correct: 2,
      explanation: text('A route template groups requests under a small, predictable set of values.', 'يجمع قالب المسار الطلبات في مجموعة صغيرة ومتوقّعة من القيم.'),
    }),
  ] },
  { key: 'query', titles: text('PromQL Check', 'اختبار PromQL'), questions: [
    question('counter-order', 'promql', {
      prompt: text('When should you apply rate to multiple counters?', 'متى تُطبّق rate على عدّادات متعددة؟'),
      choices: [text('After summing all counters', 'بعد جمع كل العدّادات'), text('After converting them to gauges', 'بعد تحويلها إلى مقاييس لحظية'), text('Before aggregating the series', 'قبل تجميع السلاسل')],
      correct: 2,
      explanation: text('Applying rate first lets Prometheus handle resets for each counter.', 'يتيح تطبيق rate أولًا حساب تصفير كل عدّاد على حدة.'),
    }),
    question('bucket-label', 'promql', {
      prompt: text('Which label must remain when aggregating classic histogram buckets for a quantile?', 'أي وسم يجب الاحتفاظ به عند تجميع دلاء مدرّج تقليدي لحساب المئين؟'),
      choices: [text('le', 'le'), text('instance', 'instance'), text('job', 'job')],
      correct: 0,
      explanation: text('The le label carries the upper bound needed for classic bucket interpolation.', 'يحمل وسم le الحدّ الأعلى اللازم للاستيفاء بين الدلاء التقليدية.'),
    }),
    question('zero-traffic', 'promql', {
      prompt: text('How should you interpret an error ratio with zero requests?', 'كيف تفسّر نسبة الأخطاء حين يكون عدد الطلبات صفرًا؟'),
      choices: [text('The service has a 100% failure rate', 'معدّل فشل الخدمة 100٪'), text('There is no traffic from which to calculate a ratio', 'لا توجد طلبات تسمح بحساب النسبة'), text('Every request succeeded', 'نجحت كل الطلبات')],
      correct: 1,
      explanation: text('A zero denominator leaves the ratio undefined.', 'لا تُعرّف النسبة عندما يكون المقام صفرًا.'),
    }),
  ] },
  { key: 'grafana', titles: text('Dashboard Check', 'اختبار لوحات المعلومات'), questions: [
    question('network-address', 'grafana', {
      prompt: text('Which URL reaches Prometheus from Grafana in the practice stack?', 'أي عنوان يصل إلى Prometheus من داخل Grafana في بيئة التدريب؟'),
      choices: [text('http://127.0.0.1:19090', 'http://127.0.0.1:19090'), text('http://prometheus:9090', 'http://prometheus:9090'), text('http://grafana:3000', 'http://grafana:3000')],
      correct: 1,
      explanation: text('Grafana resolves the Prometheus service name on the Compose network.', 'يترجم Grafana اسم خدمة Prometheus داخل شبكة Compose.'),
    }),
    question('panel-type', 'grafana', {
      prompt: text('Which panel fits a request-rate trend?', 'أي لوحة تناسب اتجاه معدّل الطلبات عبر الزمن؟'),
      choices: [text('A Time series panel', 'لوحة سلسلة زمنية'), text('A Text panel', 'لوحة نصّية'), text('A Stat showing only the last value', 'لوحة إحصائية تعرض أحدث قيمة فقط')],
      correct: 0,
      explanation: text('A time series plots the evolution of the rate over the selected interval.', 'يعرض الرسم الزمني تغيّر المعدّل خلال الفترة المختارة.'),
    }),
    question('panel-diagnosis', 'grafana', {
      prompt: text('What is the first useful comparison when a Grafana panel is empty?', 'ما أول مقارنة مفيدة عندما تكون لوحة Grafana فارغة؟'),
      choices: [text('Compare notification recipients', 'قارن مستلمي الإشعار'), text('Compare Grafana themes', 'قارن سمات Grafana'), text('Run the same query and time range in Explore', 'نفّذ الاستعلام والمدى الزمني نفسيهما في Explore')],
      correct: 2,
      explanation: text('Keeping the source and range fixed helps isolate dashboard settings from query or data problems.', 'يساعد تثبيت المصدر والمدى على تمييز إعدادات اللوحة عن مشكلات الاستعلام أو البيانات.'),
    }),
  ] },
  { key: 'operations', titles: text('Alerting and Operations Check', 'اختبار التنبيه والتشغيل'), questions: [
    question('pending', 'alerting', {
      prompt: text('What makes the practice alert wait before firing?', 'ما الذي يجعل التنبيه التدريبي ينتظر قبل الانطلاق؟'),
      choices: [text('The Grafana theme', 'سمة Grafana'), text('The dashboard time range', 'مدى لوحة المعلومات'), text('The for duration in the Prometheus rule', 'المدة for في قاعدة Prometheus')],
      correct: 2,
      explanation: text('The expression must stay active for the rule’s configured duration.', 'يجب أن يستمر تحقق التعبير طوال المدة المضبوطة في القاعدة.'),
    }),
    question('no-data', 'alerting', {
      prompt: text('Which case fits Grafana’s No Data state?', 'أي حالة تتوافق مع غياب البيانات في Grafana؟'),
      choices: [text('The evaluation succeeds with no data points', 'ينجح التقييم دون أي نقاط بيانات'), text('The query times out', 'تنتهي مهلة الاستعلام'), text('The query returns a valid zero', 'يعيد الاستعلام القيمة صفر بنجاح')],
      correct: 0,
      explanation: text('Empty successful results and failed evaluations have separate policies.', 'لكل من النتيجة الفارغة الناجحة والتقييم الفاشل سياسة مستقلة.'),
    }),
    question('restore', 'operations', {
      prompt: text('What evidence demonstrates recovery after the drill?', 'ما الدليل على التعافي بعد التمرين؟'),
      choices: [text('The sample container has a new name', 'أصبح لحاوية العينة اسم جديد'), text('The scrape returns to 1 and the alert clears', 'عاد الجلب إلى القيمة 1 وزال التنبيه'), text('The dashboard is exported as JSON', 'صُدّرت اللوحة بصيغة JSON')],
      correct: 1,
      explanation: text('Verify both the original symptom and the alert outcome after restoring the target.', 'تحقّق من زوال العَرَض الأصلي والتنبيه بعد استعادة الهدف.'),
    }),
  ] },
];

function lab(key: string, { checkpoints, ...template }: {
  titles: Text; instructions: Text; commands: string; starter: string; checkpoints: Text[]; evidencePrompt: Text;
}) {
  return {
    ...template, id: id(`lab/${key}`), labMode: 'GUIDED' as const,
    checkpoints: checkpoints.map((labels, index) => ({ id: id(`lab/${key}/step/${index + 1}`), labels })),
  };
}

const guidedLabs = [
  lab('scrapes', {
    titles: text('Bring Up the Practice Targets', 'تشغيل أهداف التدريب'),
    instructions: text('Allow 20 minutes. Copy all six files from the setup lessons into a fresh directory on your own Linux practice environment. Bring up the stack, retry readiness, then check both targets after at least one scrape interval. The starter shows the sample job you should find in the configuration.',
      'خصّص 20 دقيقة. انسخ الملفات الستة من درسَي الإعداد إلى مجلد جديد في بيئة لينكس التدريبية الخاصة بك. شغّل الخدمات وأعد فحص الجاهزية ثم افحص الهدفين بعد فترة جلب واحدة على الأقل. يعرض المقتطف مهمة العينة التي يجب أن تجدها في الإعدادات.'),
    commands: `${startCommands}\n\n${targetsQuery}`,
    starter: prometheusConfig,
    checkpoints: [text('Created the files and checked the Compose configuration', 'أنشأت الملفات وفحصت إعدادات Compose'),
      text('Verified the three readiness endpoints', 'تحقّقت من نقاط الجاهزية الثلاث'),
      text('Observed both scrape jobs reporting 1', 'لاحظت أن مهمتَي الجلب تعرضان القيمة 1')],
    evidencePrompt: text('Optionally record both job names and their observed values.', 'يمكنك تدوين اسمَي المهمتين والقيم التي رصدتها.'),
  }),
  lab('promql', {
    titles: text('Analyze Requests and Latency', 'تحليل الطلبات وزمن الاستجابة'),
    instructions: text('Allow 15 minutes. Use the running practice stack. Generate local query traffic and compare the recorded rate with the original expression from the latency lesson. In the Prometheus expression browser, run each starter expression separately and compare the static sample with the results in the lessons.',
      'خصّص 15 دقيقة. استخدم بيئة التدريب العاملة. ولّد استعلامات محلية وقارن المعدّل المسجّل بالتعبير الأصلي في درس زمن الاستجابة. نفّذ كل تعبير في المقتطف منفصلًا في متصفّح تعبيرات Prometheus وقارن بيانات العينة بنتائج الدروس.'),
    commands: trafficCommand,
    starter: `sum(demo_requests_total{status=~"5.."}) / sum(demo_requests_total)\n\n${p95}`,
    checkpoints: [text('Compared an instant result with a time range', 'قارنت نتيجة لحظية بمدى زمني'),
      text('Calculated the static error ratio and p95', 'حسبت نسبة أخطاء العينة والمئين 95'),
      text('Compared the recorded rate with its source query', 'قارنت المعدّل المسجّل باستعلامه الأصلي')],
    evidencePrompt: text('Optionally report the ratio, estimated p95, and units.', 'يمكنك تدوين النسبة وتقدير المئين 95 ووحدة القياس.'),
  }),
  lab('dashboard', {
    titles: text('Build the Practice Dashboard', 'بناء لوحة التدريب'),
    instructions: text('Allow 20 minutes. Use the provisioned Grafana data source. Verify both expressions in Explore, then create and save the Stat and Time series panels described in the dashboard lesson. Refresh the page to check the saved result.',
      'خصّص 20 دقيقة. استخدم مصدر بيانات Grafana المُعدّ مسبقًا. تحقّق من التعبيرين في Explore ثم أنشئ اللوحة الإحصائية ولوحة السلسلة الزمنية الموضّحتين في الدرس واحفظهما. أعد تحميل الصفحة للتحقّق من الحفظ.'),
    commands: 'curl -fsS http://127.0.0.1:13000/api/health',
    starter: 'up{job="sample"}\njob:prometheus_http_requests:rate2m',
    checkpoints: [text('Ran both queries in Explore', 'نفّذت الاستعلامين في Explore'),
      text('Saved panels with a status mapping and a rate unit', 'حفظت اللوحتين مع تعيين لحالة الجلب ووحدة للمعدّل'),
      text('Reloaded and checked the dashboard', 'أعدت تحميل لوحة المعلومات وفحصتها')],
    evidencePrompt: text('Optionally describe which panel answers each operational question.', 'يمكنك توضيح السؤال التشغيلي الذي تجيب عنه كل لوحة.'),
  }),
  lab('recovery', {
    titles: text('Demonstrate Recovery', 'إثبات التعافي'),
    instructions: text('Allow 20 minutes. Use the practice stack, a healthy sample scrape, and your saved dashboard. Check the rules, stop only sample, and observe pending and firing before restarting it. Compare an empty selector with a valid zero in Explore while the sample is down. Verify recovery in Prometheus, Grafana, and Alertmanager.',
      'خصّص 20 دقيقة. ابدأ ببيئة التدريب وهدف عينة سليم ولوحة محفوظة. افحص القواعد ثم أوقف خدمة العينة وحدها ولاحظ الانتظار والانطلاق قبل استئنافها. قارن محدّدًا فارغًا مع قيمة صفر صحيحة في Explore أثناء توقّف العينة. تحقّق من التعافي في Prometheus وGrafana وAlertmanager.'),
    commands: `${validateRulesCommands}\n\ndocker compose stop sample\ncurl -fsS http://127.0.0.1:19090/api/v1/alerts\ncurl -fsS http://127.0.0.1:19093/api/v2/alerts\n# Wait for firing before restarting the target.\ndocker compose start sample`,
    starter: `${alertQuery}\nup{job="never-configured"}`,
    checkpoints: [text('Verified that the rules passed configuration checks', 'تحقّقت من اجتياز القواعد فحص الإعدادات'),
      text('Observed the pending and firing alert states', 'رصدت حالتَي انتظار التنبيه وانطلاقه'),
      text('Restored the target and confirmed that the alert cleared', 'أعدت الهدف وتحقّقت من زوال التنبيه')],
    evidencePrompt: text('Optionally share the state timeline and recovery query. Keep practice passwords and internal identifiers out of your submission.',
      'يمكنك مشاركة التسلسل الزمني للحالات واستعلام التعافي. لا تُدرج كلمات مرور التدريب أو المعرّفات الداخلية في الدليل.'),
  }),
];

export const courseId = id('course');
export const bankQuestions = assessments.flatMap((quiz) => quiz.questions);
export const courseDocument = documentSchema.parse({
  slug: courseSlug,
  position: 0,
  translations: {
    en: { title: 'Prometheus and Grafana', summary: 'Build a complete monitoring workflow. Collect metrics with Prometheus, query them in PromQL, visualize service health in Grafana, and practice alerting and recovery in your own environment.' },
    ar: { title: 'Prometheus وGrafana', summary: 'ابنِ سير عمل متكاملًا للمراقبة. اجمع المقاييس باستخدام Prometheus، وحلّلها بلغة PromQL، واعرض صحّة الخدمة في Grafana، وتدرّب على التنبيه والتعافي داخل بيئتك الخاصة.' },
  },
  modules,
  quizzes: assessments.map((quiz) => ({
    id: id(`quiz/${quiz.key}`), titles: quiz.titles,
    questions: quiz.questions.map((item) => importBankQuestion(item, id(`quiz/${quiz.key}/question/${item.id}`))),
  })),
  guidedLabs,
});

if (!canPublish(courseDocument)) throw new Error('The Prometheus and Grafana course is incomplete.');
