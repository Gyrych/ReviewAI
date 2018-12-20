#include <stdint.h>
#include "cmsis_os2.h"
#include <map>

class CThead
{
	public:
		CThead(osThreadFunc_t func, void * argument, const osThreadAttr_t * attr);
		~CThead();
	private:
		osThreadId_t id;
		osThreadFunc_t func;
		std::map<osThreadId_t, CThead*> mTheadTree;
};