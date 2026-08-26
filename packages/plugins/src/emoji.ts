import type { Editor, GlyphCategory, GlyphEntry, Plugin } from '@nibble/core';
import { glyphFor, parseGlyphTable } from './glyphTable.js';

/**
 * Emotikony.
 *
 * V konfiguracích cílového projektu je `emoticons` pětkrát a byl to poslední
 * plugin z toho seznamu, který v Nibble chyběl. Vkládá se jím obyčejný znak,
 * ne obrázek — v uloženém HTML tedy nepřibude nic, co by se muselo hostovat,
 * sanitizovat nebo stahovat. Serializér prochází text po kódových bodech,
 * takže složené emoji (ZWJ, vlajky) přežijí uložení v celku.
 *
 * Seznam je vědomě ruční výběr, ne úplná tabulka Unicode. Úplná má přes tři
 * tisíce položek, česky pojmenovaných nikde, a v mřížce se v ní nedá nic
 * najít. Tady je pár set věcí, které lidé opravdu vkládají, česky a s klíčovými
 * slovy — a kdo potřebuje víc, vloží si znak z mapy znaků systému.
 */

/**
 * Kategorie. Pořadí je pořadí v dialogu.
 *
 * TinyMCE dává symboly první; tady jsou první lidé, protože obličeje a palce
 * jsou drtivá většina toho, co kdo vkládá.
 */
export const EMOJI_CATEGORIES: readonly GlyphCategory[] = [
  { key: 'lide', label: 'Lidé' },
  { key: 'priroda', label: 'Zvířata a příroda' },
  { key: 'jidlo', label: 'Jídlo a pití' },
  { key: 'aktivita', label: 'Aktivita' },
  { key: 'cestovani', label: 'Cestování a místa' },
  { key: 'objekty', label: 'Objekty' },
  { key: 'symboly', label: 'Symboly' },
  { key: 'vlajky', label: 'Vlajky' },
];

/** Seznam jako tabulka; tvar řádku popisuje `parseGlyphTable`. */
const DATA: Readonly<Record<string, string>> = {
  lide: `
😀 usmívající se obličej | smich usmev radost
😃 usmívající se obličej s velkýma očima | smich radost
😄 usmívající se obličej s přivřenýma očima | smich radost
😁 zářivý úsměv | zuby smich
😆 obličej se zavřenýma očima | smich rehot
😅 usmívající se obličej s kapkou potu | uleva smich
🤣 válí se smíchy | rehot rofl
😂 slzy radosti | smich plac lol
🙂 lehký úsměv | spokojenost
🙃 obličej vzhůru nohama | ironie legrace
😉 mrknutí | flirt
😊 usmívající se obličej s červenými tvářemi | radost stydi
😇 obličej se svatozáří | andel hodny
🥰 obličej se srdíčky | laska zamilovany
😍 oči jako srdce | laska obdiv
🤩 hvězdy v očích | nadseni uzas
😘 posílá pusu | polibek laska
😗 obličej s pusou | polibek
😚 pusa se zavřenýma očima | polibek
😙 usmívající se pusa | polibek
😋 mlsný obličej | dobrota chut
😛 vyplazený jazyk | legrace
😜 mrknutí s jazykem | legrace sibal
🤪 potrhlý obličej | blaznivy
😝 přivřené oči s jazykem | legrace
🤑 dolary v očích | penize chamtivost
🤗 objímající obličej | objeti
🤭 dlaň před ústy | ouha prekvapeni
🤫 tiše | ticho pst
🤔 přemýšlející obličej | zamysleni hmm
🤐 zip přes pusu | mlceni tajemstvi
🤨 zvednuté obočí | pochybnost neduvera
😐 neutrální obličej | bez vyrazu
😑 obličej bez výrazu | otraveny
😶 obličej beze slov | mlceni
😏 potutelný úsměv | usmesek
😒 nespokojený obličej | otraveny
🙄 protočené oči | otravenost
😬 zaťaté zuby | rozpaky
🤥 lhář | lez nos
😌 úlevný obličej | klid
😔 zamyšlený smutek | litost
😪 ospalý obličej | unava
🤤 slintá | chut
😴 spí | spanek chrapani
😷 obličej s rouškou | nemoc
🤒 teploměr v puse | nemoc horecka
🤕 obvázaná hlava | zraneni
🤢 je mu zle | nevolnost
🤮 zvrací | nevolnost
🤧 kýchá | ryma
🥵 obličej z horka | vedro
🥶 obličej z mrazu | zima
🥴 omámený obličej | opily
😵 závrať | vyrizeny
🤯 vybuchující hlava | sok uzas
🤠 kovbojský klobouk | kovboj
🥳 oslavující obličej | oslava party
😎 sluneční brýle | frajer pohoda
🤓 brýlatý šprt | sprt
🧐 monokl | zkoumani
😕 zmatený obličej | nejistota
😟 ustaraný obličej | starost
🙁 lehce zamračený obličej | smutek
☹️ zamračený obličej | smutek
😮 překvapený obličej | udiv
😯 zaražený obličej | udiv
😲 ohromený obličej | sok
😳 rudnoucí obličej | stud
🥺 prosebné oči | prosba
😦 zamračený s otevřenou pusou | udiv
😧 zděšený obličej | hruza
😨 vyděšený obličej | strach
😰 studený pot | uzkost
😥 zklamaný a ulevený | smutek
😢 plačící obličej | plac slza
😭 hlasitý pláč | brek smutek
😱 křičí hrůzou | strach
😖 zmučený obličej | trapeni
😣 vytrvalý obličej | trapeni
😞 zklamaný obličej | smutek
😓 zklamaný s potem | unava
😩 znavený obličej | unava
😫 unavený obličej | vycerpani
🥱 zívá | unava
😤 vzteklý výdech | nastvani
😡 rudý vzteklý obličej | vztek zlost
😠 naštvaný obličej | vztek
🤬 nadává | kleni vztek
😈 čertík s úsměvem | dabel
👿 zlý čertík | dabel
💀 lebka | smrt
☠️ lebka se zkříženými hnáty | jed smrt
💩 hromádka | hovinko
🤡 klaun | sasek
👻 duch | strasidlo
👽 mimozemšťan | ufo
🤖 robot | stroj
🎃 dýně | halloween
😺 usmívající se kočka | kocka
😸 zubatá kočka | kocka
😹 kočka se slzami smíchu | kocka
😻 kočka se srdíčky | kocka laska
🙀 vyděšená kočka | kocka
😿 plačící kočka | kocka
👋 mávání | ahoj pozdrav
🤚 hřbet ruky | ruka
✋ zvednutá ruka | stop dlan
🖐️ roztažená dlaň | ruka prsty
🖖 vulkánský pozdrav | spock
👌 v pořádku | ok
🤏 špetka | malinko
✌️ véčko | vitezstvi mir
🤞 držím palce | stesti
🤟 miluji tě | ruka
🤘 rohy | rock
🤙 zavolej mi | ruka
👈 ukazuje doleva | sipka ruka
👉 ukazuje doprava | sipka ruka
👆 ukazuje nahoru | sipka ruka
👇 ukazuje dolů | sipka ruka
☝️ vztyčený ukazovák | pozor
👍 palec nahoru | souhlas libi se mi
👎 palec dolů | nesouhlas
✊ zaťatá pěst | sila
👊 pěst zepředu | rana
🤛 pěst doleva | pozdrav
🤜 pěst doprava | pozdrav
👏 potlesk | tleskani
🙌 zvednuté ruce | oslava
👐 otevřené dlaně | objeti
🤲 nastavené dlaně | prosba
🤝 podání ruky | dohoda
🙏 sepjaté ruce | prosba diky modlitba
✍️ píšící ruka | psani
💪 sval | sila biceps
🦵 noha | koncetina
🦶 chodidlo | noha
👂 ucho | poslech
👃 nos | cich
🧠 mozek | mysleni
🦷 zub | zuby
👀 oči | pohled
👁️ oko | pohled
👅 jazyk | chut
👄 ústa | rty
👶 miminko | dite
🧒 dítě | deti
👦 chlapec | kluk
👧 dívka | holka
🧑 člověk | osoba
👨 muž | pan
👩 žena | pani
🧔 vousatý člověk | vousy
👴 dědeček | senior
👵 babička | seniorka
🙅 gesto ne | odmitnuti
🙆 gesto ano | souhlas
💁 podává informace | recepce
🙋 člověk zvedá ruku | hlasi se
🙇 úklona | omluva
🤦 dlaň na čele | facepalm
🤷 pokrčení rameny | nevim
👮 policista | policie
👷 dělník | stavba
💂 stráž | vojak
🕵️ detektiv | spion
👩‍⚕️ zdravotnice | lekarka
👨‍⚕️ zdravotník | lekar
👩‍🏫 učitelka | skola
👨‍🏫 učitel | skola
👩‍💻 programátorka | pocitac prace
👨‍💻 programátor | pocitac prace
👩‍🍳 kuchařka | vareni
👨‍🍳 kuchař | vareni
👩‍🌾 farmářka | zemedelstvi
👨‍🌾 farmář | zemedelstvi
🧑‍🚀 kosmonaut | vesmir
🧑‍🚒 hasič | pozar
👰 nevěsta | svatba
🤵 ženich | svatba
🎅 Santa Claus | vanoce
🤶 paní Santová | vanoce
🦸 superhrdina | hrdina
🦹 padouch | zloduch
🧙 kouzelník | carodej
🧚 víla | pohadka
🧛 upír | dracula
🧜 mořská panna | pohadka
🧝 elf | pohadka
🚶 chodec | chuze
🏃 běžec | beh
💃 tanečnice | tanec
🕺 tanečník | tanec
👯 tančící dvojice | zabava
🧘 meditace | joga klid
👪 rodina | rodice deti
👫 pár | dvojice
❤️ červené srdce | laska srdicko
🧡 oranžové srdce | laska srdicko
💛 žluté srdce | laska srdicko
💚 zelené srdce | laska srdicko
💙 modré srdce | laska srdicko
💜 fialové srdce | laska srdicko
🖤 černé srdce | laska srdicko
🤍 bílé srdce | laska srdicko
💔 zlomené srdce | rozchod
💕 dvě srdce | laska
💖 zářící srdce | laska
💘 srdce se šípem | amor laska
💝 srdce se stuhou | darek laska
💯 sto bodů | plny pocet perfektni
💤 spánek | zzz chrapani
💢 vztek | zlost
💥 výbuch | rana
💫 hvězdičky | zavrat
💦 kapky | pot voda
💨 obláček | rychlost
🗨️ bublina | rec
💬 bublina s textem | zprava
💭 myšlenková bublina | myslenka
`,

  priroda: `
🐶 psí hlava | pes stene
🐱 kočičí hlava | kocka
🐭 myší hlava | hlodavec
🐹 křeček | hlodavec
🐰 zajíc | kralik
🦊 liška | selma
🐻 medvěd | selma
🐼 panda | medved
🐨 koala | medvidek
🐯 tygří hlava | selma
🦁 lev | selma
🐮 kráva | dobytek
🐷 prasečí hlava | vepr
🐸 žába | oboojivelnik
🐵 opičí hlava | primat
🙈 nevidím | opice
🙉 neslyším | opice
🙊 nemluvím | opice
🐒 opice | primat
🐔 slepice | drubez
🐧 tučňák | ptak
🐦 pták | ptacek
🐤 kuře | mlade
🦆 kachna | ptak
🦅 orel | dravec
🦉 sova | ptak
🦇 netopýr | savec
🐺 vlk | selma
🐗 divočák | prase
🐴 koňská hlava | kun
🦄 jednorožec | pohadka
🐝 včela | med
🐛 housenka | cerv
🦋 motýl | hmyz
🐌 hlemýžď | snek
🐞 beruška | hmyz
🐜 mravenec | hmyz
🕷️ pavouk | hmyz
🦂 štír | jedovaty
🐢 želva | plaz
🐍 had | plaz
🦎 ještěrka | plaz
🦖 tyranosaurus | dinosaurus
🐙 chobotnice | more
🦑 oliheň | more
🦐 kreveta | more
🦀 krab | more
🐡 čtverzubec | ryba
🐠 tropická ryba | more
🐟 ryba | rybareni
🐬 delfín | more
🐳 velryba | more
🦈 žralok | more
🐊 krokodýl | plaz
🐅 tygr | selma
🐆 leopard | selma
🦓 zebra | savec
🦍 gorila | opice
🐘 slon | savec
🦏 nosorožec | savec
🐪 velbloud | poust
🦒 žirafa | savec
🐃 buvol | dobytek
🐎 kůň | jezdectvi
🐖 prase | vepr
🐑 ovce | vlna
🐐 koza | savec
🦌 jelen | zver
🐕 pes | mazlicek
🐩 pudl | pes
🦮 vodicí pes | pes
🐈 kočka | mazlicek
🐓 kohout | drubez
🦃 krocan | drubez
🕊️ holubice | mir ptak
🐇 králík | zajic
🐁 myš | hlodavec
🐀 krysa | hlodavec
🐿️ veverka | hlodavec
🦔 ježek | savec
🐾 tlapky | stopy
🌵 kaktus | rostlina
🎄 vánoční stromek | vanoce
🌲 jehličnan | strom les
🌳 listnatý strom | strom les
🌴 palma | strom tropy
🌱 sazenice | rostlina rust
🌿 bylina | rostlina
☘️ trojlístek | jetel
🍀 čtyřlístek | stesti
🎍 bambus | dekorace
🍃 listy ve větru | listi
🍂 spadané listí | podzim
🍁 javorový list | podzim kanada
🌾 klasy | obili
💐 kytice | kvetiny darek
🌷 tulipán | kvetina
🌹 růže | kvetina laska
🥀 zvadlá růže | kvetina
🌺 ibišek | kvetina
🌸 květ třešně | sakura jaro
🌼 sedmikráska | kvetina
🌻 slunečnice | kvetina
🌞 sluníčko s obličejem | slunce
☀️ slunce | jasno pocasi
🌝 měsíc s obličejem | uplnek
🌚 nový měsíc s obličejem | noc
🌙 srpek měsíce | noc
⭐ hvězda | hvezdicka
🌟 zářící hvězda | jiskra
✨ jiskry | kouzlo
⚡ blesk | bourka energie
☄️ kometa | vesmir
🔥 oheň | plamen
🌈 duha | pocasi
☁️ oblak | zatazeno
⛅ polojasno | pocasi
🌧️ déšť | pocasi
⛈️ bouřka | pocasi
❄️ sněhová vločka | zima snih
☃️ sněhulák | zima
💧 kapka | voda
🌊 vlna | more voda
🌍 zeměkoule Evropa a Afrika | planeta svet
🌎 zeměkoule Amerika | planeta svet
🌏 zeměkoule Asie | planeta svet
`,

  jidlo: `
🍏 zelené jablko | ovoce
🍎 červené jablko | ovoce
🍐 hruška | ovoce
🍊 pomeranč | ovoce
🍋 citron | ovoce
🍌 banán | ovoce
🍉 meloun | ovoce
🍇 hrozny | vino ovoce
🍓 jahoda | ovoce
🫐 borůvky | ovoce
🍒 třešně | ovoce
🍑 broskev | ovoce
🥭 mango | ovoce
🍍 ananas | ovoce
🥥 kokos | ovoce
🥝 kiwi | ovoce
🍅 rajče | zelenina
🍆 lilek | zelenina
🥑 avokádo | zelenina
🥦 brokolice | zelenina
🥬 listová zelenina | salat
🥒 okurka | zelenina
🌶️ chilli paprička | palive
🌽 kukuřice | zelenina
🥕 mrkev | zelenina
🧄 česnek | koreni
🧅 cibule | zelenina
🥔 brambora | zelenina
🥐 croissant | pecivo
🥖 bageta | pecivo chleba
🍞 chléb | pecivo
🥨 preclík | pecivo
🧀 sýr | mlecne
🥚 vejce | snidane
🍳 sázené vejce | snidane
🥞 lívance | palacinky
🧇 vafle | sladke
🥓 slanina | maso
🥩 steak | maso
🍗 kuřecí stehno | maso
🍖 maso s kostí | maso
🌭 párek v rohlíku | hotdog
🍔 hamburger | burger
🍟 hranolky | fastfood
🍕 pizza | italie
🥪 sendvič | svacina
🌮 taco | mexiko
🌯 burrito | mexiko
🥙 pita | jidlo
🧆 falafel | jidlo
🥗 salát | zdrave
🥘 pánev s jídlem | vareni
🍲 polévka | jidlo
🍜 nudlová polévka | ramen
🍝 špagety | testoviny
🍣 suši | japonsko
🍤 smažená kreveta | morske plody
🍚 rýže | priloha
🥟 knedlíček | dumpling
🍦 zmrzlina v kornoutu | sladke
🍩 kobliha | sladke
🍪 sušenka | sladke
🎂 dort k narozeninám | oslava
🍰 kousek dortu | sladke
🧁 cupcake | sladke
🥧 koláč | sladke
🍫 čokoláda | sladke
🍬 bonbon | sladke
🍭 lízátko | sladke
🍯 med | sladke
🍿 popcorn | kino
🧂 sůl | koreni
☕ káva | kafe napoj
🍵 čaj | napoj
🧃 džus | napoj
🥤 nápoj s brčkem | limonada
🍺 pivo | napoj
🍻 přípitek pivem | oslava
🍷 víno | napoj
🥂 přípitek | oslava sampanske
🍾 šampaňské | oslava
🥃 whisky | napoj
🍸 koktejl | napoj
🧊 led | kostka
🍽️ příbor a talíř | jidlo restaurace
🥄 lžíce | pribor
🔪 nůž | kuchyne
`,

  aktivita: `
⚽ fotbalový míč | fotbal sport
🏀 basketbalový míč | basketbal sport
🏈 míč na americký fotbal | sport
⚾ baseballový míček | sport
🎾 tenisový míček | tenis sport
🏐 volejbalový míč | volejbal sport
🏉 ragbyový míč | ragby sport
🎱 kulečník | biliar
🏓 stolní tenis | pingpong
🏸 badminton | sport
🥅 branka | hokej fotbal
🏒 hokejka | hokej
🏑 pozemní hokej | sport
🏏 kriket | sport
⛳ golf | jamka
🏹 luk a šíp | lukostrelba
🎣 rybaření | prut
🥊 boxerská rukavice | box
🥋 kimono | judo karate
⛸️ brusle | brusleni
🎿 lyže | lyzovani zima
🛷 sáňky | zima
🏂 snowboard | zima
🏋️ vzpírání | posilovna
🤸 gymnastika | kotrmelec
🤼 zápas | sport
🤽 vodní pólo | plavani
🏊 plavání | bazen
🚴 cyklistika | kolo
🚵 horské kolo | cyklistika
🏇 dostihy | kun
🧗 lezení | horolezectvi
🏆 pohár | vitezstvi trofej
🥇 zlatá medaile | prvni misto
🥈 stříbrná medaile | druhe misto
🥉 bronzová medaile | treti misto
🏅 medaile | oceneni
🎖️ vojenská medaile | vyznamenani
🎯 terč | cil presnost
🎮 herní ovladač | hry
🕹️ joystick | hry
🎲 hrací kostka | hra nahoda
🧩 puzzle | skladacka
♟️ šachy | pesec
🎭 divadlo | masky
🎨 paleta | malovani umeni
🎼 notová osnova | hudba
🎵 nota | hudba
🎶 noty | hudba
🎤 mikrofon | zpev
🎧 sluchátka | hudba
🎷 saxofon | hudba
🎸 kytara | hudba
🎹 klávesy | piano hudba
🎺 trubka | hudba
🎻 housle | hudba
🥁 buben | bici hudba
🎬 filmová klapka | film
🎪 cirkus | sapito
🎉 party | oslava konfety
🎊 konfety | oslava
🎈 balónek | oslava
🎁 dárek | narozeniny
🎀 mašle | darek
🎗️ stužka | podpora
🎟️ vstupenka | listek
🎫 lístek | vstupenka
`,

  cestovani: `
🚗 auto | vuz doprava
🚕 taxi | doprava
🚙 SUV | auto
🚌 autobus | doprava
🚎 trolejbus | doprava
🏎️ závodní auto | zavody
🚓 policejní auto | policie
🚑 sanitka | zachranka
🚒 hasičské auto | hasici
🚐 dodávka | doprava
🚚 nákladní auto | doprava kamion
🚜 traktor | zemedelstvi
🛴 koloběžka | doprava
🚲 kolo | cyklistika
🛵 skútr | motorka
🏍️ motorka | doprava
🚨 maják | policie poplach
🚝 jednokolejka | vlak
🚄 rychlovlak | vlak
🚂 lokomotiva | vlak para
🚆 vlak | doprava
🚊 tramvaj | doprava
🚇 metro | doprava
✈️ letadlo | let cestovani
🛫 vzlet | letadlo
🛬 přistání | letadlo
🚁 vrtulník | helikoptera
🚀 raketa | vesmir start
🛸 létající talíř | ufo
⛵ plachetnice | more
🚤 motorový člun | more
🛳️ výletní loď | plavba
⛴️ trajekt | lod
🚢 loď | plavba
⚓ kotva | lod
⛽ čerpací stanice | benzin
🚦 semafor | doprava
🚧 uzavírka | stavba
🗺️ mapa | cestovani
🧭 kompas | smer
🏔️ zasněžený vrchol | hory
⛰️ hora | priroda
🌋 sopka | vulkan
🏕️ kemp | stan
🏖️ pláž | dovolena more
🏜️ poušť | pisek
🏝️ opuštěný ostrov | dovolena
🏠 dům | bydleni
🏡 dům se zahradou | bydleni
🏢 kancelářská budova | prace
🏥 nemocnice | zdravi
🏦 banka | penize
🏨 hotel | ubytovani
🏫 škola | vzdelani
🏭 továrna | prumysl
🏰 hrad | zamek
🗼 věž | tokio
🗽 socha Svobody | new york
⛲ fontána | park
🌁 mlha nad městem | pocasi
🌃 noční město | noc
🌆 město za soumraku | mesto
🌇 západ slunce ve městě | vecer
🌉 most v noci | most
🎡 ruské kolo | pout
🎢 horská dráha | zabavni park
🗿 socha moai | velikonocni ostrov
`,

  objekty: `
⌚ hodinky | cas
⏰ budík | cas rano
⏱️ stopky | cas mereni
⏳ přesýpací hodiny | cas cekani
📱 mobil | telefon
💻 notebook | pocitac
⌨️ klávesnice | psani
🖥️ monitor | pocitac
🖨️ tiskárna | tisk
🖱️ počítačová myš | pocitac
💾 disketa | ulozit
💿 CD | disk
📀 DVD | disk
📷 fotoaparát | foceni
📸 blesk fotoaparátu | foceni
📹 kamera | video
🎥 filmová kamera | film
📞 telefon | hovor
☎️ pevná linka | telefon
📠 fax | dokument
📺 televize | tv
📻 rádio | vysilani
🔋 baterie | nabito
🔌 zástrčka | elektrina
💡 žárovka | napad svetlo
🔦 baterka | svetlo
🕯️ svíčka | svetlo
🧯 hasicí přístroj | pozar
🛢️ barel | ropa
💸 peníze s křídly | vydaj
💵 dolary | penize
💶 eura | penize
💰 pytel peněz | bohatstvi
💳 platební karta | platba
🧾 účtenka | doklad
✉️ obálka | posta e-mail
📧 e-mail | zprava posta
📨 doručená zpráva | e-mail
📤 odeslaná pošta | odeslat
📥 doručená pošta | prijmout
📦 balík | zasilka
📫 poštovní schránka | posta
📝 poznámka | psani tuzka
✏️ tužka | psani
🖊️ pero | psani
🖍️ pastelka | kresleni
📁 složka | soubory
📂 otevřená složka | soubory
📅 kalendář | datum
📆 trhací kalendář | datum
🗒️ blok | poznamky
📇 kartotéka | kontakty
📈 rostoucí graf | rust statistika
📉 klesající graf | pokles
📊 sloupcový graf | statistika
📋 schránka | seznam
📌 připínáček | poznamka
📍 špendlík | misto
📎 sponka | priloha
📏 pravítko | mereni
📐 trojúhelník | rysovani
✂️ nůžky | strih
🗃️ box na dokumenty | archiv
🗄️ kartotéční skříň | archiv
🗑️ koš | smazat
🔒 zámek | zabezpeceni
🔓 otevřený zámek | odemceno
🔑 klíč | pristup
🗝️ starý klíč | tajemstvi
🔨 kladivo | naradi
🪓 sekera | naradi
⛏️ krumpáč | tezba
🔧 klíč na matice | naradi oprava
🔩 šroub a matice | naradi
⚙️ ozubené kolo | nastaveni
🧰 kufřík s nářadím | oprava
🧲 magnet | pritazlivost
🧪 zkumavka | chemie
🔬 mikroskop | veda
🔭 dalekohled | astronomie
📡 satelitní anténa | signal
💉 injekce | ockovani
💊 pilulka | lek
🩹 náplast | zraneni
🩺 stetoskop | lekar
🧬 DNA | genetika
🚪 dveře | vchod
🛏️ postel | spanek
🛋️ pohovka | nabytek
🚽 záchod | toaleta
🚿 sprcha | koupelna
🛁 vana | koupel
🧴 lahvička | kosmetika
🧻 toaletní papír | koupelna
🧼 mýdlo | hygiena
🧹 koště | uklid
🛒 nákupní vozík | nakup
🎒 batoh | skola vylet
👕 tričko | obleceni
👖 džíny | obleceni
👗 šaty | obleceni
👞 bota | obuv
👟 tenisky | obuv
👑 koruna | kral
🎩 cylindr | klobouk
🧢 kšiltovka | cepice
👓 brýle | zrak
🕶️ sluneční brýle | bryle
💍 prsten | zasnuby
💎 diamant | drahokam
📖 otevřená kniha | cteni
📚 knihy | cteni knihovna
📰 noviny | zpravy
🔖 záložka | kniha
🏷️ štítek | oznaceni
🔔 zvonek | upozorneni
🔕 ztlumený zvonek | ticho
📣 megafon | oznameni
📢 hlasitý reproduktor | oznameni
🔍 lupa vlevo | hledani
🔎 lupa vpravo | hledani
`,

  symboly: `
✅ zaškrtnutí | hotovo ano
☑️ zaškrtnuté políčko | hotovo
✔️ fajfka | hotovo ano
❌ křížek | ne chyba
❎ křížek v poli | ne
⭕ kroužek | spravne
❗ vykřičník | pozor
❕ bílý vykřičník | pozor
❓ otazník | otazka
❔ bílý otazník | otazka
‼️ dvojitý vykřičník | pozor
⁉️ vykřičník s otazníkem | udiv
⚠️ výstraha | pozor varovani
🚫 zákaz | nesmi
⛔ vjezd zakázán | zakaz
🔞 od osmnácti | zakaz
☢️ radioaktivita | nebezpeci
☣️ biologické nebezpečí | nebezpeci
♻️ recyklace | ekologie
⚜️ lilie | znak
🔱 trojzubec | znak
✳️ hvězdička | znak
❇️ jiskra | znak
✴️ osmicípá hvězda | znak
💠 kosočtverec | znak
🔰 začátečník | symbol
🅿️ parkoviště | parkovani
♿ bezbariérový přístup | vozik
🚻 toalety | wc
🚹 pánské toalety | wc
🚺 dámské toalety | wc
🛗 výtah | budova
➕ plus | scitani
➖ minus | odcitani
✖️ krát | nasobeni
➗ děleno | deleni
♾️ nekonečno | matematika
💲 dolar | penize
💱 směnárna | kurz
™️ ochranná známka | pravo
©️ copyright | autorska prava
®️ registrovaná známka | pravo
🔴 červené kolečko | tecka
🟠 oranžové kolečko | tecka
🟡 žluté kolečko | tecka
🟢 zelené kolečko | tecka
🔵 modré kolečko | tecka
🟣 fialové kolečko | tecka
⚫ černé kolečko | tecka
⚪ bílé kolečko | tecka
🟥 červený čtverec | ctverecek
🟧 oranžový čtverec | ctverecek
🟨 žlutý čtverec | ctverecek
🟩 zelený čtverec | ctverecek
🟦 modrý čtverec | ctverecek
🟪 fialový čtverec | ctverecek
⬛ černý čtverec | ctverecek
⬜ bílý čtverec | ctverecek
🔺 červený trojúhelník | sipka
🔻 obrácený trojúhelník | sipka
▶️ přehrát | video
⏸️ pauza | video
⏹️ zastavit | video
⏺️ nahrávat | zaznam
⏭️ další stopa | preskocit
⏮️ předchozí stopa | zpet
⏩ rychle vpřed | pretaceni
⏪ rychle zpět | pretaceni
🔀 náhodné pořadí | shuffle
🔁 opakovat | smycka
🔂 opakovat jednou | smycka
🔼 nahoru | sipka
🔽 dolů | sipka
⬆️ šipka nahoru | smer
⬇️ šipka dolů | smer
⬅️ šipka doleva | smer
➡️ šipka doprava | smer
↗️ šipka vpravo nahoru | smer
↘️ šipka vpravo dolů | smer
↙️ šipka vlevo dolů | smer
↖️ šipka vlevo nahoru | smer
↔️ obousměrná šipka | smer
↕️ svislá šipka | smer
🔄 obnovit | dokola
🔃 kolotoč šipek | obnovit
↩️ zpět | navrat
↪️ vpřed | presmerovani
🔗 řetěz | odkaz
📶 signál | mobil
🔆 jas | svetlo
🔇 ztlumeno | zvuk
🔊 hlasitě | zvuk
🎦 kino | film
`,

  vlajky: `
🏳️ bílá vlajka | kapitulace
🏴 černá vlajka | pirat
🏁 cílová vlajka | zavod konec
🚩 trojúhelníková vlajka | znacka
🏳️‍🌈 duhová vlajka | lgbt
🇨🇿 Česko | ceska republika vlajka
🇸🇰 Slovensko | vlajka
🇵🇱 Polsko | vlajka
🇦🇹 Rakousko | vlajka
🇩🇪 Německo | vlajka
🇬🇧 Spojené království | britanie anglie vlajka
🇺🇸 Spojené státy | amerika usa vlajka
🇫🇷 Francie | vlajka
🇮🇹 Itálie | vlajka
🇪🇸 Španělsko | vlajka
🇵🇹 Portugalsko | vlajka
🇳🇱 Nizozemsko | holandsko vlajka
🇧🇪 Belgie | vlajka
🇨🇭 Švýcarsko | vlajka
🇭🇺 Maďarsko | vlajka
🇸🇮 Slovinsko | vlajka
🇭🇷 Chorvatsko | vlajka
🇷🇴 Rumunsko | vlajka
🇧🇬 Bulharsko | vlajka
🇬🇷 Řecko | vlajka
🇹🇷 Turecko | vlajka
🇺🇦 Ukrajina | vlajka
🇸🇪 Švédsko | vlajka
🇳🇴 Norsko | vlajka
🇩🇰 Dánsko | vlajka
🇫🇮 Finsko | vlajka
🇮🇪 Irsko | vlajka
🇯🇵 Japonsko | vlajka
🇨🇳 Čína | vlajka
🇰🇷 Jižní Korea | vlajka
🇮🇳 Indie | vlajka
🇧🇷 Brazílie | vlajka
🇨🇦 Kanada | vlajka
🇦🇺 Austrálie | vlajka
🇪🇺 Evropská unie | vlajka eu
`,
};

/** Nabízené emotikony. */
export const EMOJI: readonly GlyphEntry[] = parseGlyphTable(DATA, EMOJI_CATEGORIES);

export interface EmojiOptions {
  /** Vlastní seznam místo výchozího. */
  emoji?: readonly GlyphEntry[];
  categories?: readonly GlyphCategory[];
}

async function openEmojiDialog(editor: Editor, options: EmojiOptions): Promise<void> {
  const data = await editor.ui.dialog({
    title: 'Emotikony',
    fields: [{
      type: 'emoji',
      name: 'char',
      glyphs: options.emoji ?? EMOJI,
      categories: options.categories ?? EMOJI_CATEGORIES,
    }],
    submitLabel: 'Vložit',
    cancelLabel: 'Zavřít',
  });

  if (data) editor.exec('emoji', data);
}

export function createEmojiPlugin(options: EmojiOptions = {}): Plugin {
  const list = options.emoji ?? EMOJI;

  return {
    name: 'emoji',

    setup(editor) {
      editor.commands.add('emoji', (ed, args) => {
        const char = glyphFor(args, list);
        if (!char) return false;
        return ed.exec('insertText', char);
      });

      editor.ui.addButton('emoji', {
        icon: 'emoji', tooltip: 'Emotikony',
        onAction: (ed) => { void openEmojiDialog(ed, options); },
      });
    },
  };
}

export const emoji: Plugin = createEmojiPlugin();
