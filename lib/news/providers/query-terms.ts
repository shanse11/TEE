const TOPIC_ALIASES: Record<string, string[]> = {
  人工智能: ["人工智能", "AI", "大模型", "智能"],
  人工智能教育: ["人工智能", "AI", "教育", "课堂", "学校"],
  商业财经: ["经济", "财经", "金融", "商业", "企业", "消费"],
  健康生活: ["健康", "医疗", "医学", "医院", "疾病", "生活"],
  科技数码: ["科技", "数码", "芯片", "互联网", "机器人", "智能"],
  政治时政: ["时政", "政策", "会议", "治理"],
  体育赛事: ["体育", "赛事", "比赛", "运动"],
  电影娱乐: ["电影", "影视", "娱乐", "文旅"],
  学术科研: ["科研", "研究", "科学", "学术", "教育"],
};

export function newsQueryTerms(query: string): string[] {
  const normalized = query.trim();
  const direct = TOPIC_ALIASES[normalized] ?? [];
  const related = Object.entries(TOPIC_ALIASES)
    .filter(([topic]) => normalized.includes(topic) || topic.includes(normalized))
    .flatMap(([, aliases]) => aliases);
  return Array.from(new Set([normalized, ...direct, ...related])).filter(
    Boolean,
  );
}
