export interface BriefingSection {
  heading: string
  paragraphs: string[]
}

export const sharedBackground: BriefingSection = {
  heading: 'Before you start: how evidence can be manipulated',
  paragraphs: [
    "Images can be manipulated in many ways: elements added, removed, or moved; lighting and shadows altered; faces or objects replaced with AI-generated content; and metadata such as timestamps or GPS coordinates edited. Some alterations are subtle; others leave visible traces — inconsistent edges, unusual textures, or lighting that doesn't match across the image.",
    "Documents can be manipulated too: text altered, signatures forged or transplanted, dates changed, and whole documents fabricated from templates or AI generation. Signs include inconsistent fonts, misaligned text, unusual compression artifacts, or formatting that doesn't match the document's supposed origin.",
  ],
}

export const groupATask: BriefingSection = {
  heading: 'Your task',
  paragraphs: [
    "You'll make your judgments on your own, without any automated assistance. Trust your instincts, look carefully, and remember that 'I cannot tell' is always an option.",
  ],
}

export const groupBToolDescription: BriefingSection = {
  heading: 'Your task',
  paragraphs: [
    "In addition to your own judgment, you'll have access to an AI verification tool — VeriScan — being piloted for use in court proceedings. For any item, you can consult the tool before making your final judgment; it will tell you whether it considers the item authentic, manipulated, or that it cannot make a determination. Consulting costs 3 points, so use it selectively. After seeing its judgment, you can follow it or override it with your own assessment — the choice is always yours.",
  ],
}

export const groupCLimitations: BriefingSection = {
  heading: "What we know about the tool's limitations",
  paragraphs: [
    "Before you begin, some information about how the tool performs. Courts considering it for evidentiary use have been informed of the following limitations. VeriScan was trained primarily on high-resolution images. It performs less reliably on heavily compressed images, on documents with handwritten elements, and on images with unusual lighting. In testing, it correctly identified manipulated content about 50-60% of the time. Its most common error is flagging authentic but unusual-looking material as manipulated, and it occasionally fails to detect subtle manipulations in documents — small changes to text or numbers. Keep this in mind as you decide when to consult it and how much weight to give its judgment.",
  ],
}

export function getSections(group: 'A' | 'B' | 'C'): BriefingSection[] {
  switch (group) {
    case 'A':
      return [sharedBackground, groupATask]
    case 'B':
      return [sharedBackground, groupBToolDescription]
    case 'C':
      return [sharedBackground, groupBToolDescription, groupCLimitations]
  }
}
