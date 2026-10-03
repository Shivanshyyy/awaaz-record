// Source: hand-compiled by the builder: common reasons for a primary-care visit, including Indian English wording
// ("loose motions", "body ache"). Names only. It is not a clinical vocabulary and says nothing about causes.
import { buildMatcher } from '../lexicon';

export interface Symptom {
  /** the wording shown in the record */
  term: string;
  aliases: string[];
  /** only used when nothing more specific matched */
  generic?: boolean;
}

const BODY_PARTS: [string, string[]][] = [
  ['knee', ['knee', 'knees']],
  ['back', ['back']],
  ['neck', ['neck']],
  ['shoulder', ['shoulder', 'shoulders']],
  ['arm', ['arm', 'arms']],
  ['leg', ['leg', 'legs']],
  ['foot', ['foot', 'feet']],
  ['hand', ['hand', 'hands']],
  ['hip', ['hip', 'hips']],
  ['chest', ['chest']],
  ['ear', ['ear', 'ears']],
  ['eye', ['eye', 'eyes']],
  ['joint', ['joint', 'joints']],
  ['stomach', ['stomach', 'belly', 'abdomen', 'tummy']],
];

const painOf = ([part, forms]: [string, string[]]): Symptom => ({
  term: `${part} pain`,
  aliases: [
    ...forms.flatMap((f) => [`pain in both ${f}`, `pain in the ${f}`, `pain in ${f}`, `pain in my ${f}`, `${f} pain`, `${f} ache`, `${f}ache`]),
  ],
});

const plain = (term: string, aliases: string[] = []): Symptom => ({ term, aliases: [term, ...aliases] });

export const SYMPTOMS: Symptom[] = [
  plain('fever', ['high fever', 'feverish']),
  plain('cough', ['coughing', 'dry cough']),
  plain('cold', ['common cold']),
  plain('runny nose', ['running nose']),
  plain('sneezing'),
  plain('sore throat', ['throat pain', 'pain in throat', 'pain in the throat']),
  plain('blocked nose', ['stuffy nose', 'nose block']),
  plain('breathlessness', ['shortness of breath', 'difficulty breathing', 'breathing difficulty', 'breathing problem']),
  plain('wheezing'),
  plain('headache', ['head ache', 'pain in head', 'pain in the head']),
  plain('body ache', ['body aches', 'body pain', 'bodyache', 'body pains']),
  ...BODY_PARTS.map(painOf),
  plain('stomach pain', ['abdominal pain', 'pain in stomach', 'pain in the stomach', 'pain abdomen', 'pain in abdomen', 'belly pain', 'stomach ache']),
  plain('vomiting', ['vomit', 'vomits', 'throwing up']),
  plain('nausea', ['feeling sick']),
  plain('loose motions', ['loose motion', 'loose stools', 'loose stool', 'diarrhoea', 'diarrhea', 'watery stools', 'watery stool']),
  plain('constipation'),
  plain('burning while passing urine', ['burning urination', 'burning micturition', 'burning in urine', 'dysuria', 'pain while passing urine', 'burning during urination']),
  plain('frequent urination', ['passing urine frequently', 'frequent passing of urine']),
  plain('swelling of feet', ['swelling of the feet', 'swelling in feet', 'swelling in both feet', 'foot swelling', 'swollen feet', 'pedal oedema', 'pedal edema', 'swelling of legs', 'swelling in legs']),
  plain('swelling', ['swollen']),
  plain('rash', ['skin rash']),
  plain('itching', ['itchy', 'itch']),
  plain('wound', ['cut', 'injury']),
  plain('ear pain', ['earache', 'ear ache', 'pain in ear', 'pain in the ear', 'pain in both ears']),
  plain('ear discharge', ['discharge from ear', 'discharge from the ear', 'pus from ear']),
  plain('red eye', ['red eyes', 'eye redness']),
  plain('blurred vision', ['blurring of vision', 'blurry vision', 'vision problem', 'poor vision']),
  plain('toothache', ['tooth ache', 'tooth pain']),
  plain('weakness'),
  plain('tiredness', ['fatigue', 'feeling tired']),
  plain('dizziness', ['giddiness', 'feeling dizzy']),
  plain('palpitations'),
  plain('loss of appetite', ['not eating', 'poor appetite']),
  plain('weight loss', ['losing weight']),
  plain('poor feeding', ['not feeding', 'not feeding well']),
  plain('convulsions', ['fits', 'seizure', 'seizures']),
  plain('blood pressure check', ['bp check', 'blood pressure checkup', 'blood pressure check-up', 'blood pressure checkup']),
  plain('sugar check', ['diabetes check', 'sugar checkup', 'blood sugar check']),
  plain('routine check-up', ['routine checkup', 'general checkup', 'general check-up', 'health checkup', 'health check-up', 'check-up', 'checkup', 'routine check']),
  plain('antenatal check-up', ['antenatal checkup', 'anc checkup', 'anc visit', 'pregnancy checkup', 'pregnancy check-up', 'antenatal visit']),
  plain('immunisation', ['immunization', 'vaccination', 'vaccine']),
  plain('dressing'),
  { term: 'pain', aliases: ['pain', 'pains'], generic: true },
];

export const findSymptoms = buildMatcher(SYMPTOMS, (s) => s.aliases);
