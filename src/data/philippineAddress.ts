// Philippine Address Data
import { region3Barangays } from './region3Barangays';

export const philippineRegions = [
  { code: 'NCR', name: 'National Capital Region (NCR)' },
  { code: 'CAR', name: 'Cordillera Administrative Region (CAR)' },
  { code: 'I', name: 'Region I - Ilocos Region' },
  { code: 'II', name: 'Region II - Cagayan Valley' },
  { code: 'III', name: 'Region III - Central Luzon' },
  { code: 'IV-A', name: 'Region IV-A - CALABARZON' },
  { code: 'IV-B', name: 'Region IV-B - MIMAROPA' },
  { code: 'V', name: 'Region V - Bicol Region' },
  { code: 'VI', name: 'Region VI - Western Visayas' },
  { code: 'VII', name: 'Region VII - Central Visayas' },
  { code: 'VIII', name: 'Region VIII - Eastern Visayas' },
  { code: 'IX', name: 'Region IX - Zamboanga Peninsula' },
  { code: 'X', name: 'Region X - Northern Mindanao' },
  { code: 'XI', name: 'Region XI - Davao Region' },
  { code: 'XII', name: 'Region XII - SOCCSKSARGEN' },
  { code: 'XIII', name: 'Region XIII - Caraga' },
  { code: 'BARMM', name: 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)' },
];

export const philippineProvinces: Record<string, string[]> = {
  'NCR': ['Metro Manila'],
  'CAR': ['Abra', 'Apayao', 'Benguet', 'Ifugao', 'Kalinga', 'Mountain Province'],
  'I': ['Ilocos Norte', 'Ilocos Sur', 'La Union', 'Pangasinan'],
  'II': ['Batanes', 'Cagayan', 'Isabela', 'Nueva Vizcaya', 'Quirino'],
  'III': ['Aurora', 'Bataan', 'Bulacan', 'Nueva Ecija', 'Pampanga', 'Tarlac', 'Zambales'],
  'IV-A': ['Batangas', 'Cavite', 'Laguna', 'Quezon', 'Rizal'],
  'IV-B': ['Marinduque', 'Occidental Mindoro', 'Oriental Mindoro', 'Palawan', 'Romblon'],
  'V': ['Albay', 'Camarines Norte', 'Camarines Sur', 'Catanduanes', 'Masbate', 'Sorsogon'],
  'VI': ['Aklan', 'Antique', 'Capiz', 'Guimaras', 'Iloilo', 'Negros Occidental'],
  'VII': ['Bohol', 'Cebu', 'Negros Oriental', 'Siquijor'],
  'VIII': ['Biliran', 'Eastern Samar', 'Leyte', 'Northern Samar', 'Samar', 'Southern Leyte'],
  'IX': ['Zamboanga del Norte', 'Zamboanga del Sur', 'Zamboanga Sibugay'],
  'X': ['Bukidnon', 'Camiguin', 'Lanao del Norte', 'Misamis Occidental', 'Misamis Oriental'],
  'XI': ['Davao de Oro', 'Davao del Norte', 'Davao del Sur', 'Davao Occidental', 'Davao Oriental'],
  'XII': ['Cotabato', 'Sarangani', 'South Cotabato', 'Sultan Kudarat'],
  'XIII': ['Agusan del Norte', 'Agusan del Sur', 'Dinagat Islands', 'Surigao del Norte', 'Surigao del Sur'],
  'BARMM': ['Basilan', 'Lanao del Sur', 'Maguindanao', 'Sulu', 'Tawi-Tawi'],
};

export const philippineCities: Record<string, string[]> = {
  // NCR
  'Metro Manila': [
    'Caloocan City', 'Las Piñas City', 'Makati City', 'Malabon City', 'Mandaluyong City',
    'Manila', 'Marikina City', 'Muntinlupa City', 'Navotas City', 'Parañaque City',
    'Pasay City', 'Pasig City', 'Pateros', 'Quezon City', 'San Juan City',
    'Taguig City', 'Valenzuela City'
  ],
  // CAR
  'Abra': ['Bangued', 'Boliney', 'Bucay', 'Bucloc', 'Daguioman', 'Danglas', 'Dolores', 'La Paz', 'Lacub', 'Lagangilang', 'Lagayan', 'Langiden', 'Licuan-Baay', 'Luba', 'Malibcong', 'Manabo', 'Peñarrubia', 'Pidigan', 'Pilar', 'Sallapadan', 'San Isidro', 'San Juan', 'San Quintin', 'Tayum', 'Tineg', 'Tubo', 'Villaviciosa'],
  'Apayao': ['Calanasan', 'Conner', 'Flora', 'Kabugao', 'Luna', 'Pudtol', 'Santa Marcela'],
  'Benguet': ['Atok', 'Baguio City', 'Bakun', 'Bokod', 'Buguias', 'Itogon', 'Kabayan', 'Kapangan', 'Kibungan', 'La Trinidad', 'Mankayan', 'Sablan', 'Tuba', 'Tublay'],
  'Ifugao': ['Aguinaldo', 'Alfonso Lista', 'Asipulo', 'Banaue', 'Hingyon', 'Hungduan', 'Kiangan', 'Lagawe', 'Lamut', 'Mayoyao', 'Tinoc'],
  'Kalinga': ['Balbalan', 'Lubuagan', 'Pasil', 'Pinukpuk', 'Rizal', 'Tabuk City', 'Tanudan', 'Tinglayan'],
  'Mountain Province': ['Barlig', 'Bauko', 'Besao', 'Bontoc', 'Natonin', 'Paracelis', 'Sabangan', 'Sadanga', 'Sagada', 'Tadian'],
  // Region I
  'Ilocos Norte': ['Adams', 'Bacarra', 'Badoc', 'Bangui', 'Banna', 'Batac City', 'Burgos', 'Carasi', 'Currimao', 'Dingras', 'Dumalneg', 'Laoag City', 'Marcos', 'Nueva Era', 'Pagudpud', 'Paoay', 'Pasuquin', 'Piddig', 'Pinili', 'San Nicolas', 'Sarrat', 'Solsona', 'Vintar'],
  'Ilocos Sur': ['Alilem', 'Banayoyo', 'Bantay', 'Burgos', 'Cabugao', 'Candon City', 'Caoayan', 'Cervantes', 'Galimuyod', 'Gregorio del Pilar', 'Lidlidda', 'Magsingal', 'Nagbukel', 'Narvacan', 'Quirino', 'Salcedo', 'San Emilio', 'San Esteban', 'San Ildefonso', 'San Juan', 'San Vicente', 'Santa', 'Santa Catalina', 'Santa Cruz', 'Santa Lucia', 'Santa Maria', 'Santiago', 'Santo Domingo', 'Sigay', 'Sinait', 'Sugpon', 'Suyo', 'Tagudin', 'Vigan City'],
  'La Union': ['Agoo', 'Aringay', 'Bacnotan', 'Bagulin', 'Balaoan', 'Bangar', 'Bauang', 'Burgos', 'Caba', 'Luna', 'Naguilian', 'Pugo', 'Rosario', 'San Fernando City', 'San Gabriel', 'San Juan', 'Santo Tomas', 'Santol', 'Sudipen', 'Tubao'],
  'Pangasinan': ['Agno', 'Aguilar', 'Alaminos City', 'Alcala', 'Anda', 'Asingan', 'Balungao', 'Bani', 'Basista', 'Bautista', 'Bayambang', 'Binalonan', 'Binmaley', 'Bolinao', 'Bugallon', 'Burgos', 'Calasiao', 'Dagupan City', 'Dasol', 'Infanta', 'Labrador', 'Laoac', 'Lingayen', 'Mabini', 'Malasiqui', 'Manaoag', 'Mangaldan', 'Mangatarem', 'Mapandan', 'Natividad', 'Pozorrubio', 'Rosales', 'San Carlos City', 'San Fabian', 'San Jacinto', 'San Manuel', 'San Nicolas', 'San Quintin', 'Santa Barbara', 'Santa Maria', 'Santo Tomas', 'Sison', 'Sual', 'Tayug', 'Umingan', 'Urbiztondo', 'Urdaneta City', 'Villasis'],
  // Region II
  'Batanes': ['Basco', 'Itbayat', 'Ivana', 'Mahatao', 'Sabtang', 'Uyugan'],
  'Cagayan': ['Abulug', 'Alcala', 'Allacapan', 'Amulung', 'Aparri', 'Baggao', 'Ballesteros', 'Buguey', 'Calayan', 'Camalaniugan', 'Claveria', 'Enrile', 'Gattaran', 'Gonzaga', 'Iguig', 'Lal-lo', 'Lasam', 'Pamplona', 'Peñablanca', 'Piat', 'Rizal', 'Sanchez-Mira', 'Santa Ana', 'Santa Praxedes', 'Santa Teresita', 'Santo Niño', 'Solana', 'Tuao', 'Tuguegarao City'],
  'Isabela': ['Alicia', 'Angadanan', 'Aurora', 'Benito Soliven', 'Burgos', 'Cabagan', 'Cabatuan', 'Cauayan City', 'Cordon', 'Delfin Albano', 'Dinapigue', 'Divilacan', 'Echague', 'Gamu', 'Ilagan City', 'Jones', 'Luna', 'Maconacon', 'Mallig', 'Naguilian', 'Palanan', 'Quezon', 'Quirino', 'Ramon', 'Reina Mercedes', 'Roxas', 'San Agustin', 'San Guillermo', 'San Isidro', 'San Manuel', 'San Mariano', 'San Mateo', 'San Pablo', 'Santa Maria', 'Santiago City', 'Santo Tomas', 'Tumauini'],
  'Nueva Vizcaya': ['Alfonso Castañeda', 'Ambaguio', 'Aritao', 'Bagabag', 'Bambang', 'Bayombong', 'Diadi', 'Dupax del Norte', 'Dupax del Sur', 'Kasibu', 'Kayapa', 'Quezon', 'Santa Fe', 'Solano', 'Villaverde'],
  'Quirino': ['Aglipay', 'Cabarroguis', 'Diffun', 'Maddela', 'Nagtipunan', 'Saguday'],
  // Region III
  'Aurora': ['Baler', 'Casiguran', 'Dilasag', 'Dinalungan', 'Dingalan', 'Dipaculao', 'Maria Aurora', 'San Luis'],
  'Bataan': ['Abucay', 'Bagac', 'Balanga City', 'Dinalupihan', 'Hermosa', 'Limay', 'Mariveles', 'Morong', 'Orani', 'Orion', 'Pilar', 'Samal'],
  'Bulacan': ['Angat', 'Balagtas', 'Baliuag', 'Bocaue', 'Bulakan', 'Bustos', 'Calumpit', 'Doña Remedios Trinidad', 'Guiguinto', 'Hagonoy', 'Malolos City', 'Marilao', 'Meycauayan City', 'Norzagaray', 'Obando', 'Pandi', 'Paombong', 'Plaridel', 'Pulilan', 'San Ildefonso', 'San Jose del Monte City', 'San Miguel', 'San Rafael', 'Santa Maria'],
  'Nueva Ecija': ['Aliaga', 'Bongabon', 'Cabanatuan City', 'Cabiao', 'Carranglan', 'Cuyapo', 'Gabaldon', 'Gapan City', 'General Mamerto Natividad', 'General Tinio', 'Guimba', 'Jaen', 'Laur', 'Licab', 'Llanera', 'Lupao', 'Muñoz City', 'Nampicuan', 'Palayan City', 'Pantabangan', 'Peñaranda', 'Quezon', 'Rizal', 'San Antonio', 'San Isidro', 'San Jose City', 'San Leonardo', 'Santa Rosa', 'Santo Domingo', 'Talavera', 'Talugtug', 'Zaragoza'],
  'Pampanga': ['Angeles City', 'Apalit', 'Arayat', 'Bacolor', 'Candaba', 'Floridablanca', 'Guagua', 'Lubao', 'Mabalacat City', 'Macabebe', 'Magalang', 'Masantol', 'Mexico', 'Minalin', 'Porac', 'San Fernando City', 'San Luis', 'San Simon', 'Santa Ana', 'Santa Rita', 'Santo Tomas', 'Sasmuan'],
  'Tarlac': ['Anao', 'Bamban', 'Camiling', 'Capas', 'Concepcion', 'Gerona', 'La Paz', 'Mayantoc', 'Moncada', 'Paniqui', 'Pura', 'Ramos', 'San Clemente', 'San Jose', 'San Manuel', 'Santa Ignacia', 'Tarlac City', 'Victoria'],
  'Zambales': ['Botolan', 'Cabangan', 'Candelaria', 'Castillejos', 'Iba', 'Masinloc', 'Olongapo City', 'Palauig', 'San Antonio', 'San Felipe', 'San Marcelino', 'San Narciso', 'Santa Cruz', 'Subic'],
  // Region IV-A
  'Batangas': ['Agoncillo', 'Alitagtag', 'Balayan', 'Balete', 'Batangas City', 'Bauan', 'Calaca', 'Calatagan', 'Cuenca', 'Ibaan', 'Laurel', 'Lemery', 'Lian', 'Lipa City', 'Lobo', 'Mabini', 'Malvar', 'Mataasnakahoy', 'Nasugbu', 'Padre Garcia', 'Rosario', 'San Jose', 'San Juan', 'San Luis', 'San Nicolas', 'San Pascual', 'Santa Teresita', 'Santo Tomas', 'Taal', 'Talisay', 'Tanauan City', 'Taysan', 'Tingloy', 'Tuy'],
  'Cavite': ['Alfonso', 'Amadeo', 'Bacoor City', 'Carmona', 'Cavite City', 'Dasmariñas City', 'General Emilio Aguinaldo', 'General Mariano Alvarez', 'General Trias City', 'Imus City', 'Indang', 'Kawit', 'Magallanes', 'Maragondon', 'Mendez', 'Naic', 'Noveleta', 'Rosario', 'Silang', 'Tagaytay City', 'Tanza', 'Ternate', 'Trece Martires City'],
  'Laguna': ['Alaminos', 'Bay', 'Biñan City', 'Cabuyao City', 'Calamba City', 'Calauan', 'Cavinti', 'Famy', 'Kalayaan', 'Liliw', 'Los Baños', 'Luisiana', 'Lumban', 'Mabitac', 'Magdalena', 'Majayjay', 'Nagcarlan', 'Paete', 'Pagsanjan', 'Pakil', 'Pangil', 'Pila', 'Rizal', 'San Pablo City', 'San Pedro City', 'Santa Cruz', 'Santa Maria', 'Santa Rosa City', 'Siniloan', 'Victoria'],
  'Quezon': ['Agdangan', 'Alabat', 'Atimonan', 'Buenavista', 'Burdeos', 'Calauag', 'Candelaria', 'Catanauan', 'Dolores', 'General Luna', 'General Nakar', 'Guinayangan', 'Gumaca', 'Infanta', 'Jomalig', 'Lopez', 'Lucban', 'Lucena City', 'Macalelon', 'Mauban', 'Mulanay', 'Padre Burgos', 'Pagbilao', 'Panukulan', 'Patnanungan', 'Perez', 'Pitogo', 'Plaridel', 'Polillo', 'Quezon', 'Real', 'Sampaloc', 'San Andres', 'San Antonio', 'San Francisco', 'San Narciso', 'Sariaya', 'Tagkawayan', 'Tayabas City', 'Tiaong', 'Unisan'],
  'Rizal': ['Angono', 'Antipolo City', 'Baras', 'Binangonan', 'Cainta', 'Cardona', 'Jalajala', 'Morong', 'Pililla', 'Rodriguez', 'San Mateo', 'Tanay', 'Taytay', 'Teresa'],
  // Region IV-B
  'Marinduque': ['Boac', 'Buenavista', 'Gasan', 'Mogpog', 'Santa Cruz', 'Torrijos'],
  'Occidental Mindoro': ['Abra de Ilog', 'Calintaan', 'Looc', 'Lubang', 'Magsaysay', 'Mamburao', 'Paluan', 'Rizal', 'Sablayan', 'San Jose', 'Santa Cruz'],
  'Oriental Mindoro': ['Baco', 'Bansud', 'Bongabong', 'Bulalacao', 'Calapan City', 'Gloria', 'Mansalay', 'Naujan', 'Pinamalayan', 'Pola', 'Puerto Galera', 'Roxas', 'San Teodoro', 'Socorro', 'Victoria'],
  'Palawan': ['Aborlan', 'Agutaya', 'Araceli', 'Balabac', 'Bataraza', 'Brooke\'s Point', 'Busuanga', 'Cagayancillo', 'Coron', 'Culion', 'Cuyo', 'Dumaran', 'El Nido', 'Kalayaan', 'Linapacan', 'Magsaysay', 'Narra', 'Puerto Princesa City', 'Quezon', 'Rizal', 'Roxas', 'San Vicente', 'Sofronio Española', 'Taytay'],
  'Romblon': ['Alcantara', 'Banton', 'Cajidiocan', 'Calatrava', 'Concepcion', 'Corcuera', 'Ferrol', 'Looc', 'Magdiwang', 'Odiongan', 'Romblon', 'San Agustin', 'San Andres', 'San Fernando', 'San Jose', 'Santa Fe', 'Santa Maria'],
  // Region V
  'Albay': ['Bacacay', 'Camalig', 'Daraga', 'Guinobatan', 'Jovellar', 'Legazpi City', 'Libon', 'Ligao City', 'Malilipot', 'Malinao', 'Manito', 'Oas', 'Pio Duran', 'Polangui', 'Rapu-Rapu', 'Santo Domingo', 'Tabaco City', 'Tiwi'],
  'Camarines Norte': ['Basud', 'Capalonga', 'Daet', 'Jose Panganiban', 'Labo', 'Mercedes', 'Paracale', 'San Lorenzo Ruiz', 'San Vicente', 'Santa Elena', 'Talisay', 'Vinzons'],
  'Camarines Sur': ['Baao', 'Balatan', 'Bato', 'Bombon', 'Buhi', 'Bula', 'Cabusao', 'Calabanga', 'Camaligan', 'Canaman', 'Caramoan', 'Del Gallego', 'Gainza', 'Garchitorena', 'Goa', 'Iriga City', 'Lagonoy', 'Libmanan', 'Lupi', 'Magarao', 'Milaor', 'Minalabac', 'Nabua', 'Naga City', 'Ocampo', 'Pamplona', 'Pasacao', 'Pili', 'Presentacion', 'Ragay', 'Sagñay', 'San Fernando', 'San Jose', 'Sipocot', 'Siruma', 'Tigaon', 'Tinambac'],
  'Catanduanes': ['Bagamanoc', 'Baras', 'Bato', 'Caramoran', 'Gigmoto', 'Pandan', 'Panganiban', 'San Andres', 'San Miguel', 'Viga', 'Virac'],
  'Masbate': ['Aroroy', 'Baleno', 'Balud', 'Batuan', 'Cataingan', 'Cawayan', 'Claveria', 'Dimasalang', 'Esperanza', 'Mandaon', 'Masbate City', 'Milagros', 'Mobo', 'Monreal', 'Palanas', 'Pio V. Corpuz', 'Placer', 'San Fernando', 'San Jacinto', 'San Pascual', 'Uson'],
  'Sorsogon': ['Barcelona', 'Bulan', 'Bulusan', 'Casiguran', 'Castilla', 'Donsol', 'Gubat', 'Irosin', 'Juban', 'Magallanes', 'Matnog', 'Pilar', 'Prieto Diaz', 'Santa Magdalena', 'Sorsogon City'],
  // Region VI
  'Aklan': ['Altavas', 'Balete', 'Banga', 'Batan', 'Buruanga', 'Ibajay', 'Kalibo', 'Lezo', 'Libacao', 'Madalag', 'Makato', 'Malay', 'Malinao', 'Nabas', 'New Washington', 'Numancia', 'Tangalan'],
  'Antique': ['Anini-y', 'Barbaza', 'Belison', 'Bugasong', 'Caluya', 'Culasi', 'Hamtic', 'Laua-an', 'Libertad', 'Pandan', 'Patnongon', 'San Jose', 'San Remigio', 'Sebaste', 'Sibalom', 'Tibiao', 'Tobias Fornier', 'Valderrama'],
  'Capiz': ['Cuartero', 'Dao', 'Dumalag', 'Dumarao', 'Ivisan', 'Jamindan', 'Maayon', 'Mambusao', 'Panay', 'Panitan', 'Pilar', 'Pontevedra', 'President Roxas', 'Roxas City', 'Sapi-an', 'Sigma', 'Tapaz'],
  'Guimaras': ['Buenavista', 'Jordan', 'Nueva Valencia', 'San Lorenzo', 'Sibunag'],
  'Iloilo': ['Ajuy', 'Alimodian', 'Anilao', 'Badiangan', 'Balasan', 'Banate', 'Barotac Nuevo', 'Barotac Viejo', 'Batad', 'Bingawan', 'Cabatuan', 'Calinog', 'Carles', 'Concepcion', 'Dingle', 'Dueñas', 'Dumangas', 'Estancia', 'Guimbal', 'Igbaras', 'Iloilo City', 'Janiuay', 'Lambunao', 'Leganes', 'Lemery', 'Leon', 'Maasin', 'Miagao', 'Mina', 'New Lucena', 'Oton', 'Passi City', 'Pavia', 'Pototan', 'San Dionisio', 'San Enrique', 'San Joaquin', 'San Miguel', 'San Rafael', 'Santa Barbara', 'Sara', 'Tigbauan', 'Tubungan', 'Zarraga'],
  'Negros Occidental': ['Bacolod City', 'Bago City', 'Binalbagan', 'Cadiz City', 'Calatrava', 'Candoni', 'Cauayan', 'Enrique B. Magalona', 'Escalante City', 'Himamaylan City', 'Hinigaran', 'Hinoba-an', 'Ilog', 'Isabela', 'Kabankalan City', 'La Carlota City', 'La Castellana', 'Manapla', 'Moises Padilla', 'Murcia', 'Pontevedra', 'Pulupandan', 'Sagay City', 'Salvador Benedicto', 'San Carlos City', 'San Enrique', 'Silay City', 'Sipalay City', 'Talisay City', 'Toboso', 'Valladolid', 'Victorias City'],
  // Region VII
  'Bohol': ['Alburquerque', 'Alicia', 'Anda', 'Antequera', 'Baclayon', 'Balilihan', 'Batuan', 'Bien Unido', 'Bilar', 'Buenavista', 'Calape', 'Candijay', 'Carmen', 'Catigbian', 'Clarin', 'Corella', 'Cortes', 'Dagohoy', 'Danao', 'Dauis', 'Dimiao', 'Duero', 'Garcia Hernandez', 'Getafe', 'Guindulman', 'Inabanga', 'Jagna', 'Lila', 'Loay', 'Loboc', 'Loon', 'Mabini', 'Maribojoc', 'Panglao', 'Pilar', 'President Carlos P. Garcia', 'Sagbayan', 'San Isidro', 'San Miguel', 'Sevilla', 'Sierra Bullones', 'Sikatuna', 'Tagbilaran City', 'Talibon', 'Trinidad', 'Tubigon', 'Ubay', 'Valencia'],
  'Cebu': ['Alcantara', 'Alcoy', 'Alegria', 'Aloguinsan', 'Argao', 'Asturias', 'Badian', 'Balamban', 'Bantayan', 'Barili', 'Bogo City', 'Boljoon', 'Borbon', 'Carcar City', 'Carmen', 'Catmon', 'Cebu City', 'Compostela', 'Consolacion', 'Cordova', 'Daanbantayan', 'Dalaguete', 'Danao City', 'Dumanjug', 'Ginatilan', 'Lapu-Lapu City', 'Liloan', 'Madridejos', 'Malabuyoc', 'Mandaue City', 'Medellin', 'Minglanilla', 'Moalboal', 'Naga City', 'Oslob', 'Pilar', 'Pinamungajan', 'Poro', 'Ronda', 'Samboan', 'San Fernando', 'San Francisco', 'San Remigio', 'Santa Fe', 'Santander', 'Sibonga', 'Sogod', 'Tabogon', 'Tabuelan', 'Talisay City', 'Toledo City', 'Tuburan', 'Tudela'],
  'Negros Oriental': ['Amlan', 'Ayungon', 'Bacong', 'Bais City', 'Basay', 'Bayawan City', 'Bindoy', 'Canlaon City', 'Dauin', 'Dumaguete City', 'Guihulngan City', 'Jimalalud', 'La Libertad', 'Mabinay', 'Manjuyod', 'Pamplona', 'San Jose', 'Santa Catalina', 'Siaton', 'Sibulan', 'Tanjay City', 'Tayasan', 'Valencia', 'Vallehermoso', 'Zamboanguita'],
  'Siquijor': ['Enrique Villanueva', 'Larena', 'Lazi', 'Maria', 'San Juan', 'Siquijor'],
  // Region VIII
  'Biliran': ['Almeria', 'Biliran', 'Cabucgayan', 'Caibiran', 'Culaba', 'Kawayan', 'Maripipi', 'Naval'],
  'Eastern Samar': ['Arteche', 'Balangiga', 'Balangkayan', 'Borongan City', 'Can-avid', 'Dolores', 'General MacArthur', 'Giporlos', 'Guiuan', 'Hernani', 'Jipapad', 'Lawaan', 'Llorente', 'Maslog', 'Maydolong', 'Mercedes', 'Oras', 'Quinapondan', 'Salcedo', 'San Julian', 'San Policarpo', 'Sulat', 'Taft'],
  'Leyte': ['Abuyog', 'Alangalang', 'Albuera', 'Babatngon', 'Barugo', 'Bato', 'Baybay City', 'Burauen', 'Calubian', 'Capoocan', 'Carigara', 'Dagami', 'Dulag', 'Hilongos', 'Hindang', 'Inopacan', 'Isabel', 'Jaro', 'Javier', 'Julita', 'Kananga', 'La Paz', 'Leyte', 'MacArthur', 'Mahaplag', 'Matag-ob', 'Matalom', 'Mayorga', 'Merida', 'Ormoc City', 'Palo', 'Palompon', 'Pastrana', 'San Isidro', 'San Miguel', 'Santa Fe', 'Tabango', 'Tabontabon', 'Tanauan', 'Tolosa', 'Tunga', 'Villaba'],
  'Northern Samar': ['Allen', 'Biri', 'Bobon', 'Capul', 'Catarman', 'Catubig', 'Gamay', 'Laoang', 'Lapinig', 'Las Navas', 'Lavezares', 'Lope de Vega', 'Mapanas', 'Mondragon', 'Palapag', 'Pambujan', 'Rosario', 'San Antonio', 'San Isidro', 'San Jose', 'San Roque', 'San Vicente', 'Silvino Lobos', 'Victoria'],
  'Samar': ['Almagro', 'Basey', 'Calbayog City', 'Calbiga', 'Catbalogan City', 'Daram', 'Gandara', 'Hinabangan', 'Jiabong', 'Marabut', 'Matuguinao', 'Motiong', 'Pagsanghan', 'Paranas', 'Pinabacdao', 'San Jorge', 'San Jose de Buan', 'San Sebastian', 'Santa Margarita', 'Santa Rita', 'Santo Niño', 'Tagapul-an', 'Talalora', 'Tarangnan', 'Villareal', 'Zumarraga'],
  'Southern Leyte': ['Anahawan', 'Bontoc', 'Hinunangan', 'Hinundayan', 'Libagon', 'Liloan', 'Limasawa', 'Maasin City', 'Macrohon', 'Malitbog', 'Padre Burgos', 'Pintuyan', 'Saint Bernard', 'San Francisco', 'San Juan', 'San Ricardo', 'Silago', 'Sogod', 'Tomas Oppus'],
  // Region IX
  'Zamboanga del Norte': ['Baliguian', 'Dapitan City', 'Dipolog City', 'Godod', 'Gutalac', 'Jose Dalman', 'Kalawit', 'Katipunan', 'La Libertad', 'Labason', 'Liloy', 'Manukan', 'Mutia', 'Piñan', 'Polanco', 'President Manuel A. Roxas', 'Rizal', 'Salug', 'Sergio Osmeña Sr.', 'Siayan', 'Sibuco', 'Sibutad', 'Sindangan', 'Siocon', 'Sirawai', 'Tampilisan'],
  'Zamboanga del Sur': ['Aurora', 'Bayog', 'Dimataling', 'Dinas', 'Dumalinao', 'Dumingag', 'Guipos', 'Josefina', 'Kumalarang', 'Labangan', 'Lakewood', 'Lapuyan', 'Mahayag', 'Margosatubig', 'Midsalip', 'Molave', 'Pagadian City', 'Pitogo', 'Ramon Magsaysay', 'San Miguel', 'San Pablo', 'Sominot', 'Tabina', 'Tambulig', 'Tigbao', 'Tukuran', 'Vincenzo A. Sagun', 'Zamboanga City'],
  'Zamboanga Sibugay': ['Alicia', 'Buug', 'Diplahan', 'Imelda', 'Ipil', 'Kabasalan', 'Mabuhay', 'Malangas', 'Naga', 'Olutanga', 'Payao', 'Roseller Lim', 'Siay', 'Talusan', 'Titay', 'Tungawan'],
  // Region X
  'Bukidnon': ['Baungon', 'Cabanglasan', 'Damulog', 'Dangcagan', 'Don Carlos', 'Impasugong', 'Kadingilan', 'Kalilangan', 'Kibawe', 'Kitaotao', 'Lantapan', 'Libona', 'Malaybalay City', 'Malitbog', 'Manolo Fortich', 'Maramag', 'Pangantucan', 'Quezon', 'San Fernando', 'Sumilao', 'Talakag', 'Valencia City'],
  'Camiguin': ['Catarman', 'Guinsiliban', 'Mahinog', 'Mambajao', 'Sagay'],
  'Lanao del Norte': ['Bacolod', 'Baloi', 'Baroy', 'Iligan City', 'Kapatagan', 'Kauswagan', 'Kolambugan', 'Lala', 'Linamon', 'Magsaysay', 'Maigo', 'Matungao', 'Munai', 'Nunungan', 'Pantao Ragat', 'Pantar', 'Poona Piagapo', 'Salvador', 'Sapad', 'Sultan Naga Dimaporo', 'Tagoloan', 'Tangcal', 'Tubod'],
  'Misamis Occidental': ['Aloran', 'Baliangao', 'Bonifacio', 'Calamba', 'Clarin', 'Concepcion', 'Don Victoriano Chiongbian', 'Jimenez', 'Lopez Jaena', 'Oroquieta City', 'Ozamiz City', 'Panaon', 'Plaridel', 'Sapang Dalaga', 'Sinacaban', 'Tangub City', 'Tudela'],
  'Misamis Oriental': ['Alubijid', 'Balingasag', 'Balingoan', 'Binuangan', 'Cagayan de Oro City', 'Claveria', 'El Salvador City', 'Gingoog City', 'Gitagum', 'Initao', 'Jasaan', 'Kinoguitan', 'Lagonglong', 'Laguindingan', 'Libertad', 'Lugait', 'Magsaysay', 'Manticao', 'Medina', 'Naawan', 'Opol', 'Salay', 'Sugbongcogon', 'Tagoloan', 'Talisayan', 'Villanueva'],
  // Region XI
  'Davao de Oro': ['Compostela', 'Laak', 'Mabini', 'Maco', 'Maragusan', 'Mawab', 'Monkayo', 'Montevista', 'Nabunturan', 'New Bataan', 'Pantukan'],
  'Davao del Norte': ['Asuncion', 'Braulio E. Dujali', 'Carmen', 'Kapalong', 'New Corella', 'Panabo City', 'Samal City', 'San Isidro', 'Santo Tomas', 'Tagum City', 'Talaingod'],
  'Davao del Sur': ['Bansalan', 'Davao City', 'Digos City', 'Hagonoy', 'Kiblawan', 'Magsaysay', 'Malalag', 'Matanao', 'Padada', 'Santa Cruz', 'Sulop'],
  'Davao Occidental': ['Don Marcelino', 'Jose Abad Santos', 'Malita', 'Santa Maria', 'Sarangani'],
  'Davao Oriental': ['Baganga', 'Banaybanay', 'Boston', 'Caraga', 'Cateel', 'Governor Generoso', 'Lupon', 'Manay', 'Mati City', 'San Isidro', 'Tarragona'],
  // Region XII
  'Cotabato': ['Alamada', 'Aleosan', 'Antipas', 'Arakan', 'Banisilan', 'Carmen', 'Kabacan', 'Kidapawan City', 'Libungan', 'M\'lang', 'Magpet', 'Makilala', 'Matalam', 'Midsayap', 'Pigcawayan', 'Pikit', 'President Roxas', 'Tulunan'],
  'Sarangani': ['Alabel', 'Glan', 'Kiamba', 'Maasim', 'Maitum', 'Malapatan', 'Malungon'],
  'South Cotabato': ['Banga', 'General Santos City', 'Koronadal City', 'Lake Sebu', 'Norala', 'Polomolok', 'Santo Niño', 'Surallah', 'T\'Boli', 'Tampakan', 'Tantangan', 'Tupi'],
  'Sultan Kudarat': ['Bagumbayan', 'Columbio', 'Esperanza', 'Isulan', 'Kalamansig', 'Lambayong', 'Lebak', 'Lutayan', 'Palimbang', 'President Quirino', 'Senator Ninoy Aquino', 'Tacurong City'],
  // Region XIII
  'Agusan del Norte': ['Buenavista', 'Butuan City', 'Cabadbaran City', 'Carmen', 'Jabonga', 'Kitcharao', 'Las Nieves', 'Magallanes', 'Nasipit', 'Remedios T. Romualdez', 'Santiago', 'Tubay'],
  'Agusan del Sur': ['Bayugan City', 'Bunawan', 'Esperanza', 'La Paz', 'Loreto', 'Prosperidad', 'Rosario', 'San Francisco', 'San Luis', 'Santa Josefa', 'Sibagat', 'Talacogon', 'Trento', 'Veruela'],
  'Dinagat Islands': ['Basilisa', 'Cagdianao', 'Dinagat', 'Libjo', 'Loreto', 'San Jose', 'Tubajon'],
  'Surigao del Norte': ['Alegria', 'Bacuag', 'Burgos', 'Claver', 'Dapa', 'Del Carmen', 'General Luna', 'Gigaquit', 'Mainit', 'Malimono', 'Pilar', 'Placer', 'San Benito', 'San Francisco', 'San Isidro', 'Santa Monica', 'Sison', 'Socorro', 'Surigao City', 'Tagana-an', 'Tubod'],
  'Surigao del Sur': ['Barobo', 'Bayabas', 'Bislig City', 'Cagwait', 'Cantilan', 'Carmen', 'Carrascal', 'Cortes', 'Hinatuan', 'Lanuza', 'Lianga', 'Lingig', 'Madrid', 'Marihatag', 'San Agustin', 'San Miguel', 'Tagbina', 'Tago', 'Tandag City'],
  // BARMM
  'Basilan': ['Akbar', 'Al-Barka', 'Hadji Mohammad Ajul', 'Hadji Muhtamad', 'Isabela City', 'Lamitan City', 'Lantawan', 'Maluso', 'Sumisip', 'Tabuan-Lasa', 'Tipo-Tipo', 'Tuburan', 'Ungkaya Pukan'],
  'Lanao del Sur': ['Bacolod-Kalawi', 'Balabagan', 'Balindong', 'Bayang', 'Binidayan', 'Buadiposo-Buntong', 'Bubong', 'Butig', 'Calanogas', 'Ditsaan-Ramain', 'Ganassi', 'Kapai', 'Kapatagan', 'Lumba-Bayabao', 'Lumbaca-Unayan', 'Lumbatan', 'Lumbayanague', 'Madalum', 'Madamba', 'Maguing', 'Malabang', 'Marantao', 'Marawi City', 'Marogong', 'Masiu', 'Mulondo', 'Pagayawan', 'Piagapo', 'Picong', 'Poona Bayabao', 'Pualas', 'Saguiaran', 'Sultan Dumalondong', 'Tagoloan II', 'Tamparan', 'Taraka', 'Tubaran', 'Tugaya', 'Wao'],
  'Maguindanao': ['Ampatuan', 'Barira', 'Buldon', 'Buluan', 'Cotabato City', 'Datu Abdullah Sangki', 'Datu Anggal Midtimbang', 'Datu Blah T. Sinsuat', 'Datu Hoffer Ampatuan', 'Datu Montawal', 'Datu Odin Sinsuat', 'Datu Paglas', 'Datu Piang', 'Datu Salibo', 'Datu Saudi-Ampatuan', 'Datu Unsay', 'Gen. S. K. Pendatun', 'Guindulungan', 'Kabuntalan', 'Mamasapano', 'Mangudadatu', 'Matanog', 'Northern Kabuntalan', 'Pagalungan', 'Paglat', 'Pandag', 'Parang', 'Rajah Buayan', 'Shariff Aguak', 'Shariff Saydona Mustapha', 'South Upi', 'Sultan Kudarat', 'Sultan Mastura', 'Sultan sa Barongis', 'Sultan Sumagka', 'Talayan', 'Talitay', 'Upi'],
  'Sulu': ['Banguingui', 'Hadji Panglima Tahil', 'Indanan', 'Jolo', 'Kalingalan Caluang', 'Lugus', 'Luuk', 'Maimbung', 'Old Panamao', 'Omar', 'Pandami', 'Panglima Estino', 'Pangutaran', 'Parang', 'Pata', 'Patikul', 'Siasi', 'Talipao', 'Tapul'],
  'Tawi-Tawi': ['Bongao', 'Languyan', 'Mapun', 'Panglima Sugala', 'Sapa-Sapa', 'Sibutu', 'Simunul', 'Sitangkai', 'South Ubian', 'Tandubas', 'Turtle Islands'],
};

export const philippineBarangays: Record<string, string[]> = {
  ...region3Barangays, // Import all Region III barangays
  
  // Default option for cities without specific barangay data
  'default': ['Poblacion', 'Barangay 1', 'Barangay 2', 'Barangay 3'],
  
  // NCR - Metro Manila
  'Manila': ['Barangay 1-897 (897 barangays)'],
  'Quezon City': [
    'Alicia', 'Amihan', 'Apolonio Samson', 'Aurora', 'Baesa', 'Bagbag',
    'Bagong Lipunan ng Crame', 'Bagong Pag-asa', 'Bagong Silangan', 'Bagumbayan',
    'Bagumbuhay', 'Bahay Toro', 'Balingasa', 'Batasan Hills', 'Bayanihan',
    'Blue Ridge A', 'Blue Ridge B', 'Botocan', 'Bungad', 'Camp Aguinaldo',
    'Central', 'Claro', 'Commonwealth', 'Culiat', 'Damar', 'Damayan',
    'Del Monte', 'Diliman', 'Don Manuel', 'Doña Imelda', 'Doña Josefa',
    'Duyan-Duyan', 'E. Rodriguez', 'Escopa I', 'Escopa II', 'Escopa III',
    'Escopa IV', 'Fairview', 'Greater Lagro', 'Gulod', 'Holy Spirit',
    'Horseshoe', 'Kaligayahan', 'Kalusugan', 'Kamuning', 'Katipunan',
    'Kaunlaran', 'Kristong Hari', 'Krus na Ligas', 'Laging Handa', 'Libis',
    'Lourdes', 'Loyola Heights', 'Maharlika', 'Malaya', 'Mangga', 'Manresa',
    'Mariana', 'Mariblo', 'Marilag', 'Masagana', 'Masambong', 'Matandang Balara',
    'Milagrosa', 'N.S. Amoranto', 'Nagkaisang Nayon', 'Nayong Kanluran', 'New Era',
    'North Fairview', 'Novaliches Proper', 'Obrero', 'Old Capitol Site', 'Paang Bundok',
    'Pag-ibig sa Nayon', 'Paligsahan', 'Paltok', 'Pansol', 'Paraiso',
    'Pasong Putik Proper', 'Pasong Tamo', 'Payatas', 'Phil-Am', 'Pinagkaisahan',
    'Pinyahan', 'Project 6', 'Quirino 2-A', 'Quirino 2-B', 'Quirino 2-C',
    'Quirino 3-A', 'Ramon Magsaysay', 'Roxas', 'Sacred Heart', 'Saint Ignatius',
    'Saint Peter', 'Salvacion', 'San Agustin', 'San Antonio', 'San Bartolome',
    'San Isidro', 'San Isidro Labrador', 'San Jose', 'San Martin de Porres', 'San Roque',
    'San Vicente', 'Sangandaan', 'Santa Cruz', 'Santa Lucia', 'Santa Monica',
    'Santa Teresita', 'Santo Cristo', 'Santo Niño', 'Santol', 'Sauyo',
    'Sienna', 'Sikatuna Village', 'Silangan', 'South Triangle', 'Tagumpay',
    'Talampas', 'Talayan', 'Talipapa', 'Tandang Sora', 'Tatalon', 'Teachers Village East',
    'Teachers Village West', 'Ugong Norte', 'Unang Sigaw', 'UP Campus', 'UP Village',
    'Valencia', 'Vasra', 'Veterans Village', 'Villa Maria Clara', 'West Triangle',
    'White Plains'
  ],
  'Makati City': [
    'Bangkal', 'Bel-Air', 'Carmona', 'Cembo', 'Comembo', 'Dasmariñas',
    'East Rembo', 'Forbes Park', 'Guadalupe Nuevo', 'Guadalupe Viejo', 'Kasilawan',
    'La Paz', 'Magallanes', 'Olympia', 'Palanan', 'Pembo', 'Pinagkaisahan',
    'Pio del Pilar', 'Pitogo', 'Poblacion', 'Rizal', 'San Antonio',
    'San Isidro', 'San Lorenzo', 'Santa Cruz', 'Singkamas', 'South Cembo',
    'Tejeros', 'Urdaneta', 'Valenzuela', 'West Rembo'
  ],
  'Taguig City': [
    'Bagumbayan', 'Bambang', 'Calzada', 'Central Bicutan', 'Central Signal Village',
    'Fort Bonifacio', 'Hagonoy', 'Ibayo-Tipas', 'Katuparan', 'Ligid-Tipas',
    'Lower Bicutan', 'Maharlika Village', 'Napindan', 'New Lower Bicutan', 'North Daang Hari',
    'North Signal Village', 'Palingon', 'Pinagsama', 'San Miguel', 'Santa Ana',
    'South Daang Hari', 'South Signal Village', 'Tanyag', 'Tuktukan', 'Upper Bicutan',
    'Ususan', 'Wawa', 'Western Bicutan'
  ],
  
  // Region III - Bulacan
  'Norzagaray': [
    'Bangkal', 'Baraka', 'Bigte', 'Bitungol', 'Friendship', 'Matictic', 
    'Minuyan', 'Partida', 'Pinagtulayan', 'Poblacion', 'San Mateo', 
    'Santa Rosa', 'Tigbe'
  ],
  'Malolos City': [
    'Anilao', 'Atlag', 'Babatnin', 'Bagna', 'Bagong Bayan', 'Balayong',
    'Balite', 'Bangkal', 'Barihan', 'Bulihan', 'Bungahan', 'Caingin',
    'Calero', 'Caliligawan', 'Canalate', 'Catmon', 'Cofradia', 'Dakila',
    'Guinhawa', 'Ligas', 'Liyang', 'Longos', 'Look 1st', 'Look 2nd',
    'Lugam', 'Mabolo', 'Mambog', 'Masile', 'Matimbo', 'Mojon',
    'Namayan', 'Niugan', 'Pamarawan', 'Panasahan', 'Pinagbakahan', 'San Agustin',
    'San Gabriel', 'San Juan', 'San Pablo', 'San Vicente', 'Santiago',
    'Santisima Trinidad', 'Santo Cristo', 'Santo Niño', 'Santo Rosario', 'Sumapang Bata',
    'Sumapang Matanda', 'Taal', 'Tikay'
  ],
  'San Jose del Monte City': [
    'Assumption', 'Bagong Buhay', 'Citrus', 'Ciudad Real', 'Dulong Bayan',
    'Fatima', 'Francisco Homes-Guijo', 'Francisco Homes-Mulawin', 'Francisco Homes-Narra',
    'Francisco Homes-Yakal', 'Gaya-gaya', 'Graceville', 'Gumaoc Central', 'Gumaoc East',
    'Gumaoc West', 'Kaybanban', 'Kaypian', 'Lawang Pari', 'Maharlika',
    'Minuyan', 'Minuyan II', 'Minuyan III', 'Minuyan IV', 'Minuyan V',
    'Minuyan Proper', 'Muzon', 'Paradise III', 'Poblacion', 'San Isidro',
    'San Manuel', 'San Martin', 'San Pedro', 'San Rafael', 'San Roque',
    'Santa Cruz', 'Santo Cristo', 'Santo Niño', 'Sapang Palay', 'Tungkong Mangga'
  ],
  
  // Region III - Pampanga
  'Angeles City': [
    'Agapito del Rosario', 'Amsic', 'Anunas', 'Balibago', 'Capaya', 'Claro M. Recto',
    'Cuayan', 'Cutcut', 'Cutud', 'Lourdes North West', 'Malabanias', 'Margot',
    'Pampang', 'Pulung Maragul', 'Salapungan', 'San Jose', 'San Nicolas',
    'Santa Teresita', 'Santo Cristo', 'Santo Rosario', 'Sapangbato', 'Timog'
  ],
  'San Fernando City': [
    'Alasas', 'Baliti', 'Bulaon', 'Calulut', 'Dela Paz Norte', 'Dela Paz Sur',
    'Dolores', 'Juliana', 'Lara', 'Lourdes', 'Magliman', 'Maimpis',
    'Malino', 'Malpitic', 'Pandaras', 'Panipuan', 'Pulung Bulo', 'Quebiawan',
    'Saguin', 'San Agustin', 'San Felipe', 'San Isidro', 'San Jose',
    'San Juan', 'San Nicolas', 'Santa Lucia', 'Santa Teresita', 'Santo Niño',
    'Santo Rosario', 'Sindalan', 'Telabastagan'
  ],
  
  // Region VII - Cebu
  'Cebu City': [
    'Adlaon', 'Agsungot', 'Apas', 'Babag', 'Bacayan', 'Banilad', 'Basak Pardo',
    'Basak San Nicolas', 'Binaliw', 'Bonbon', 'Budla-an', 'Buhisan', 'Bulacao',
    'Buot-Taup Pardo', 'Busay', 'Calamba', 'Cambinocot', 'Capitol Site', 'Carreta',
    'Central', 'Cogon Pardo', 'Cogon Ramos', 'Day-as', 'Duljo', 'Ermita',
    'Guadalupe', 'Guba', 'Hippodromo', 'Inayawan', 'Kalubihan', 'Kalunasan',
    'Kamagayan', 'Kamputhaw', 'Kasambagan', 'Kinasang-an Pardo', 'Labangon', 'Lahug',
    'Lorega', 'Lusaran', 'Luz', 'Mabini', 'Mabolo', 'Malubog', 'Mambaling',
    'Pahina Central', 'Pahina San Nicolas', 'Pardo', 'Pari-an', 'Paril', 'Pasil',
    'Pit-os', 'Poblacion Pardo', 'Pulangbato', 'Pung-ol-Sibugay', 'Punta Princesa', 'Quiot Pardo',
    'Sambag I', 'Sambag II', 'San Antonio', 'San Jose', 'San Nicolas Central',
    'San Roque', 'Santa Cruz', 'Sapangdaku', 'Sawang Calero', 'Sinsin',
    'Sirao', 'Suba', 'Sudlon I', 'Sudlon II', 'T. Padilla', 'Tabunan',
    'Tagba-o', 'Talamban', 'Taptap', 'Tejero', 'Tinago', 'Tisa', 'To-ong Pardo', 'Zapatera'
  ],
  'Mandaue City': [
    'Alang-alang', 'Bakilid', 'Banilad', 'Basak', 'Cabancalan', 'Cambaro',
    'Canduman', 'Casili', 'Casuntingan', 'Centro', 'Cubacub', 'Guizo',
    'Ibabao-Estancia', 'Jagobiao', 'Labogon', 'Looc', 'Maguikay', 'Mantuyong',
    'Opao', 'Pagsabungan', 'Pakna-an', 'Subangdaku', 'Tabok', 'Tawason',
    'Tingub', 'Tipolo', 'Umapad'
  ],
  
  // Region XI - Davao
  'Davao City': [
    'Acacia', 'Agdao', 'Alambre', 'Alejandra Navarro', 'Alfonso Angliongto Sr.',
    'Angalan', 'Atan-awe', 'Baganihan', 'Bago Aplaya', 'Bago Gallera', 'Bago Oshiro',
    'Baguio', 'Balengaeng', 'Baliok', 'Bangkas Heights', 'Bantol', 'Baracatan',
    'Bato', 'Bayabas', 'Biao Escuela', 'Biao Guianga', 'Biao Joaquin', 'Binugao',
    'Bucana', 'Buda', 'Buhangin', 'Bunawan', 'Cabantian', 'Cadalian', 'Calinan',
    'Callawa', 'Camansi', 'Carmen', 'Catalunan Grande', 'Catalunan Pequeño', 'Catigan',
    'Cawayan', 'Centro', 'Colosas', 'Communal', 'Crossing Bayabas', 'Dacudao',
    'Dalag', 'Dalagdag', 'Daliao', 'Daliaon Plantation', 'Datu Salumay', 'Dominga',
    'Dumoy', 'Eden', 'Fatima', 'Gatungan', 'Gov. Paciano Bangoy', 'Gov. Vicente Duterte',
    'Gumalang', 'Gumitan', 'Ilang', 'Inayangan', 'Indangan', 'Kap. Tomas Monteverde Sr.',
    'Kilate', 'Lacson', 'Lamanan', 'Lampianao', 'Langub', 'Lapu-lapu', 'Leon Garcia',
    'Lizada', 'Los Amigos', 'Lubogan', 'Lumiad', 'Ma-a', 'Mabuhay', 'Magsaysay',
    'Magtuod', 'Mahayag', 'Malabog', 'Malagos', 'Malamba', 'Manambulan', 'Mandug',
    'Manuel Guianga', 'Mapula', 'Marapangi', 'Marilog', 'Matina Aplaya', 'Matina Biao',
    'Matina Crossing', 'Matina Pangi', 'Megkawayan', 'Mintal', 'Mudiang', 'Mulig',
    'New Carmen', 'New Valencia', 'Pampanga', 'Panacan', 'Panalum', 'Pandaitan',
    'Pangyan', 'Paquibato', 'Paradise Embak', 'Rafael Castillo', 'Riverside', 'Salapawan',
    'Salaysay', 'Saloy', 'San Antonio', 'San Isidro', 'Santo Niño', 'Sasa', 'Sibulan',
    'Sirawan', 'Sirib', 'Suawan', 'Subasta', 'Sumimao', 'Tacunan', 'Tagakpan',
    'Tagluno', 'Tagurano', 'Talandang', 'Talomo', 'Talomo River', 'Tamayong', 'Tambobong',
    'Tamugan', 'Tapak', 'Tawan-tawan', 'Tibuloy', 'Tibungco', 'Tigatto', 'Toril',
    'Tugbok', 'Tungkalan', 'Ubalde', 'Ula', 'Vicente Hizon Sr.', 'Waan', 'Wangan',
    'Wilfredo Aquino', 'Wines'
  ],
  
  // Add generic barangays for other cities
  // This will be used as fallback
};
